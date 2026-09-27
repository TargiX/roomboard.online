defmodule RoomboardRealtimeWeb.InternalEventController do
  @moduledoc """
  HMAC-authenticated HTTP endpoint that lets the Next app fan server-originated
  room events out to Phoenix Channel subscribers. The caller signs the raw
  request body with the shared `ROOMBOARD_REALTIME_SECRET`; we verify, then
  broadcast into the room topic without touching role gates or rate limits
  (those already protect the socket-side `room:event` push path).
  """

  use RoomboardRealtimeWeb, :controller

  # Keep this controller's allowlist separate from the channel's: the channel
  # accepts board mutations from authenticated browsers, while this endpoint
  # accepts the smaller set of events the server-side may originate. New
  # server-originated types belong here, not in RoomChannel.
  @allowed_internal_event_types ~w(
    room:message
    comment:created
    item:created
    item:updated
  )
  @max_body_bytes 80_000
  @room_id_regex ~r/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,96}$/

  def room_event(conn, _params) do
    if Map.has_key?(conn.assigns, :plug_parser_error) do
      # The endpoint wrapper rescued a Plug.Parsers.ParseError before we got
      # here — bad JSON deserves a 422 from this controller, not the default
      # 400 the parser would have raised.
      unprocessable(conn)
    else
      with {:secret, secret} when is_binary(secret) and secret != "" <-
             {:secret, realtime_secret()},
           {:signature, sig} when is_binary(sig) and byte_size(sig) > 0 <-
             {:signature, signature(conn)},
           {:raw, body} when is_binary(body) and body != "" <- {:raw, raw_body(conn)},
           {:size, true} <- {:size, byte_size(body) <= @max_body_bytes},
           {:verified, true} <- {:verified, secure_signature?(body, sig)},
           {:json, {:ok, payload}} <- {:json, Jason.decode(body)},
           :ok <- validate_payload(payload) do
        broadcast_room_event(payload["roomId"], payload["event"])

        json(conn, %{ok: true})
      else
        {:secret, _} -> service_unavailable(conn)
        {:signature, _} -> unauthorized(conn)
        {:raw, _} -> unprocessable(conn)
        {:size, false} -> payload_too_large(conn)
        {:verified, false} -> unauthorized(conn)
        {:json, _} -> unprocessable(conn)
        :invalid_room -> unprocessable(conn)
        :invalid_event -> unprocessable(conn)
        :invalid_type -> unprocessable(conn)
      end
    end
  end

  defp validate_payload(%{"roomId" => room_id, "event" => event}) when is_binary(room_id) do
    cond do
      not String.match?(room_id, @room_id_regex) ->
        :invalid_room

      true ->
        validate_event(event)
    end
  end

  defp validate_payload(_), do: :invalid_room

  defp validate_event(%{"type" => type}) when is_binary(type) do
    if type in @allowed_internal_event_types, do: :ok, else: :invalid_type
  end

  defp validate_event(%{}), do: :invalid_event
  defp validate_event(_), do: :invalid_event

  defp realtime_secret do
    System.get_env("ROOMBOARD_REALTIME_SECRET", "")
  end

  defp signature(conn) do
    case Plug.Conn.get_req_header(conn, "x-roomboard-internal-signature") do
      [signature | _] -> signature
      _ -> nil
    end
  end

  defp raw_body(conn) do
    Map.get(conn.assigns, :raw_body)
  end

  defp secure_signature?(body, signature) do
    expected =
      :hmac
      |> :crypto.mac(:sha256, realtime_secret(), body)
      |> Base.url_encode64(padding: false)

    byte_size(signature) == byte_size(expected) and
      Plug.Crypto.secure_compare(signature, expected)
  end

  defp broadcast_room_event(room_id, event) do
    broadcasted =
      event
      |> Map.put("roomId", room_id)
      |> Map.put_new("sentAt", System.system_time(:millisecond))

    RoomboardRealtimeWeb.Endpoint.broadcast("room:" <> room_id, "room:event", broadcasted)
  end

  defp unauthorized(conn) do
    conn
    |> put_status(:unauthorized)
    |> json(%{ok: false, reason: "invalid_signature"})
  end

  defp payload_too_large(conn) do
    conn
    |> put_status(413)
    |> json(%{ok: false, reason: "payload_too_large"})
  end

  defp unprocessable(conn) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{ok: false, reason: "invalid_payload"})
  end

  defp service_unavailable(conn) do
    conn
    |> put_status(:service_unavailable)
    |> json(%{ok: false, reason: "secret_not_configured"})
  end
end
