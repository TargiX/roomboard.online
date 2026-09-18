defmodule RoomboardRealtimeWeb.RoomChannel do
  use Phoenix.Channel

  alias RoomboardRealtimeWeb.Presence

  @allowed_room_event_types ~w(
    item:created
    item:updated
    item:moved
    item:deleted
    comment:created
    connection:created
    connection:deleted
    room:updated
    room:closed
  )
  @max_room_event_bytes 80_000
  @presence_ttl_ms 15_000

  @impl true
  def join("room:" <> room_id, payload, socket) do
    cond do
      not valid_room_id?(room_id) ->
        {:error, %{reason: "invalid_room"}}

      not authorized_room_join?(room_id, payload) ->
        {:error, %{reason: "unauthorized_room"}}

      true ->
        socket =
          socket
          |> assign(:room_id, room_id)
          |> assign(:focus, clean_string(payload["focus"], 120) || "canvas")
          |> assign(:x, clean_number(payload["x"]) || 0)
          |> assign(:y, clean_number(payload["y"]) || 0)

        send(self(), :after_join)

        {:ok, %{roomId: room_id}, socket}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    {:ok, _ref} = track(socket)
    push(socket, "presence_state", Presence.list(socket))
    {:noreply, socket}
  end

  @impl true
  def handle_in("presence:update", payload, socket) do
    socket =
      socket
      |> assign(:focus, clean_string(payload["focus"], 120) || socket.assigns.focus)
      |> assign(:x, clean_number(payload["x"]) || socket.assigns.x)
      |> assign(:y, clean_number(payload["y"]) || socket.assigns.y)

    :ok = update_presence(socket)

    broadcast!(socket, "presence:update", presence_payload(socket))
    {:reply, {:ok, %{presence: presence_payload(socket)}}, socket}
  end

  def handle_in("room:event", payload, socket) when is_map(payload) do
    with :ok <- validate_room_event(payload) do
      event =
        payload
        |> Map.take([
          "type",
          "clientId",
          "comment",
          "connection",
          "connectionId",
          "item",
          "itemId",
          "room"
        ])
        |> Map.put("roomId", socket.assigns.room_id)
        |> Map.put("senderId", socket.assigns.user_id)
        |> Map.put("sentAt", now_ms())

      broadcast!(socket, "room:event", event)
      {:reply, {:ok, event}, socket}
    else
      {:error, reason} -> {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in(_event, _payload, socket),
    do: {:reply, {:error, %{reason: "unsupported_event"}}, socket}

  defp track(socket) do
    Presence.track(socket, socket.assigns.user_id, presence_payload(socket))
  end

  defp update_presence(socket) do
    case Presence.update(socket, socket.assigns.user_id, presence_payload(socket)) do
      {:ok, _ref} -> :ok
      {:error, {:nopresence, _pid, _topic, _key}} -> track_presence_after_reconnect(socket)
    end
  end

  defp track_presence_after_reconnect(socket) do
    case track(socket) do
      {:ok, _ref} -> :ok
      {:error, {:already_tracked, _pid, _topic, _key}} -> :ok
    end
  end

  defp validate_room_event(payload) do
    cond do
      payload_size(payload) > @max_room_event_bytes ->
        {:error, "payload_too_large"}

      not is_binary(payload["type"]) ->
        {:error, "invalid_type"}

      payload["type"] not in @allowed_room_event_types ->
        {:error, "unsupported_type"}

      true ->
        :ok
    end
  end

  defp payload_size(payload) do
    case Jason.encode(payload) do
      {:ok, encoded} -> byte_size(encoded)
      {:error, _reason} -> @max_room_event_bytes + 1
    end
  end

  defp presence_payload(socket) do
    %{
      id: socket.assigns.user_id,
      name: socket.assigns.name,
      color: socket.assigns.color,
      focus: socket.assigns.focus,
      x: socket.assigns.x,
      y: socket.assigns.y,
      updatedAt: now_ms(),
      expiresAt: now_ms() + @presence_ttl_ms
    }
  end

  defp valid_room_id?(room_id) do
    String.match?(room_id, ~r/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,96}$/)
  end

  defp authorized_room_join?(room_id, payload) do
    secret = realtime_secret()

    cond do
      is_binary(secret) and secret != "" ->
        verify_access_token(clean_string(payload["accessToken"], 2_400), room_id, secret)

      prod_auth_required?() ->
        false

      true ->
        true
    end
  end

  defp realtime_secret do
    System.get_env("ROOMBOARD_REALTIME_SECRET", "")
  end

  defp prod_auth_required? do
    System.get_env("MIX_ENV") == "prod" and
      System.get_env("ROOMBOARD_ALLOW_UNAUTHENTICATED_ROOMS") != "true"
  end

  defp verify_access_token(nil, _room_id, _secret), do: false

  defp verify_access_token(token, room_id, secret) do
    with [encoded_payload, signature] <- String.split(token, ".", parts: 2),
         true <- secure_signature?(encoded_payload, signature, secret),
         {:ok, json} <- Base.url_decode64(encoded_payload, padding: false),
         {:ok, payload} <- Jason.decode(json),
         %{"v" => "rb1", "roomId" => ^room_id, "role" => role, "exp" => exp} <- payload,
         true <- is_binary(role) and is_number(exp) and exp > now_ms() do
      true
    else
      _ -> false
    end
  end

  defp secure_signature?(encoded_payload, signature, secret) do
    expected =
      :hmac
      |> :crypto.mac(:sha256, secret, encoded_payload)
      |> Base.url_encode64(padding: false)

    byte_size(signature) == byte_size(expected) and
      Plug.Crypto.secure_compare(signature, expected)
  end

  defp clean_string(nil, _max), do: nil

  defp clean_string(value, max) when is_binary(value) do
    value
    |> String.trim()
    |> String.slice(0, max)
    |> case do
      "" -> nil
      value -> value
    end
  end

  defp clean_string(_value, _max), do: nil

  defp clean_number(value) when is_number(value), do: value
  defp clean_number(_value), do: nil

  defp now_ms, do: System.system_time(:millisecond)
end
