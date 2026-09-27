defmodule RoomboardRealtimeWeb.InternalEventControllerTest do
  use RoomboardRealtimeWeb.ConnCase, async: false

  setup do
    room_id = "room-#{System.unique_integer([:positive])}"
    secret = "test-roomboard-realtime-secret"

    previous_secret = System.get_env("ROOMBOARD_REALTIME_SECRET")
    System.put_env("ROOMBOARD_REALTIME_SECRET", secret)

    on_exit(fn ->
      if previous_secret do
        System.put_env("ROOMBOARD_REALTIME_SECRET", previous_secret)
      else
        System.delete_env("ROOMBOARD_REALTIME_SECRET")
      end
    end)

    {:ok, conn: Phoenix.ConnTest.build_conn(), room_id: room_id, secret: secret}
  end

  describe "POST /internal/room-event (happy path)" do
    test "accepts a signed body and broadcasts room:event to subscribers",
         %{conn: conn, room_id: room_id, secret: secret} do
      Phoenix.PubSub.subscribe(RoomboardRealtime.PubSub, "room:" <> room_id)

      event = %{"type" => "room:message", "message" => %{"body" => "hello"}}
      payload = %{"roomId" => room_id, "event" => event}
      body = Jason.encode!(payload)
      signature = sign_body(secret, body)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", signature)
        |> post(~p"/internal/room-event", body)

      assert json_response(conn, 200) == %{"ok" => true}

      assert_receive %Phoenix.Socket.Broadcast{
        topic: "room:" <> _topic,
        event: "room:event",
        payload: payload
      }

      assert payload["type"] == "room:message"
      assert payload["message"] == %{"body" => "hello"}
      assert payload["roomId"] == room_id
      assert is_integer(payload["sentAt"])
    end

    test "stamps sentAt when missing, keeps caller-provided sentAt",
         %{conn: conn, room_id: room_id, secret: secret} do
      Phoenix.PubSub.subscribe(RoomboardRealtime.PubSub, "room:" <> room_id)

      event = %{"type" => "comment:created", "comment" => %{"id" => "c-1"}, "sentAt" => 1_700_000_000_000}
      body = Jason.encode!(%{"roomId" => room_id, "event" => event})
      signature = sign_body(secret, body)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", signature)
        |> post(~p"/internal/room-event", body)

      assert json_response(conn, 200) == %{"ok" => true}

      assert_receive %Phoenix.Socket.Broadcast{payload: payload}
      assert payload["sentAt"] == 1_700_000_000_000

      # Now without sentAt; controller should stamp it.
      body = Jason.encode!(%{"roomId" => room_id, "event" => %{"type" => "item:created"}})
      signature = sign_body(secret, body)

      conn2 =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", signature)
        |> post(~p"/internal/room-event", body)

      assert json_response(conn2, 200) == %{"ok" => true}

      assert_receive %Phoenix.Socket.Broadcast{payload: payload2}
      assert is_integer(payload2["sentAt"])
      assert payload2["type"] == "item:created"
      assert payload2["roomId"] == room_id
    end

    test "passes through senderId without inventing one",
         %{conn: conn, room_id: room_id, secret: secret} do
      Phoenix.PubSub.subscribe(RoomboardRealtime.PubSub, "room:" <> room_id)

      event = %{
        "type" => "room:message",
        "senderId" => "rba1_#{room_id}_deadbeef",
        "message" => %{"body" => "from agent"}
      }

      body = Jason.encode!(%{"roomId" => room_id, "event" => event})
      signature = sign_body(secret, body)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", signature)
        |> post(~p"/internal/room-event", body)

      assert json_response(conn, 200) == %{"ok" => true}

      assert_receive %Phoenix.Socket.Broadcast{payload: payload}
      assert payload["senderId"] == "rba1_#{room_id}_deadbeef"

      # And without senderId the controller must NOT invent one.
      body = Jason.encode!(%{"roomId" => room_id, "event" => %{"type" => "item:updated"}})
      signature = sign_body(secret, body)

      conn2 =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", signature)
        |> post(~p"/internal/room-event", body)

      assert json_response(conn2, 200) == %{"ok" => true}

      assert_receive %Phoenix.Socket.Broadcast{payload: payload2}
      refute Map.has_key?(payload2, "senderId")
    end
  end

  describe "POST /internal/room-event (auth)" do
    test "401 when signature header is missing",
         %{conn: conn, room_id: room_id} do
      body = Jason.encode!(%{"roomId" => room_id, "event" => %{"type" => "room:message"}})
      Phoenix.PubSub.subscribe(RoomboardRealtime.PubSub, "room:" <> room_id)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/internal/room-event", body)

      assert json_response(conn, 401) == %{"ok" => false, "reason" => "invalid_signature"}

      # No broadcast on auth failure.
      refute_receive %Phoenix.Socket.Broadcast{}, 50
    end

    test "401 when signature is wrong",
         %{conn: conn, room_id: room_id, secret: secret} do
      Phoenix.PubSub.subscribe(RoomboardRealtime.PubSub, "room:" <> room_id)

      body = Jason.encode!(%{"roomId" => room_id, "event" => %{"type" => "room:message"}})
      bad_signature = sign_body(secret <> "-tampered", body)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", bad_signature)
        |> post(~p"/internal/room-event", body)

      assert json_response(conn, 401) == %{"ok" => false, "reason" => "invalid_signature"}
      refute_receive %Phoenix.Socket.Broadcast{}, 50
    end

    test "503 when secret env is unset", %{conn: conn, room_id: room_id} do
      previous_secret = System.get_env("ROOMBOARD_REALTIME_SECRET")
      System.delete_env("ROOMBOARD_REALTIME_SECRET")

      on_exit(fn ->
        if previous_secret do
          System.put_env("ROOMBOARD_REALTIME_SECRET", previous_secret)
        else
          System.delete_env("ROOMBOARD_REALTIME_SECRET")
        end
      end)

      body = Jason.encode!(%{"roomId" => room_id, "event" => %{"type" => "room:message"}})

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", "anything")
        |> post(~p"/internal/room-event", body)

      assert json_response(conn, 503) == %{"ok" => false, "reason" => "secret_not_configured"}
    end
  end

  describe "POST /internal/room-event (validation)" do
    test "422 on disallowed event type", %{conn: conn, room_id: room_id, secret: secret} do
      body =
        Jason.encode!(%{
          "roomId" => room_id,
          "event" => %{"type" => "item:deleted"}
        })

      signature = sign_body(secret, body)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", signature)
        |> post(~p"/internal/room-event", body)

      assert json_response(conn, 422) == %{"ok" => false, "reason" => "invalid_payload"}
    end

    test "422 on invalid roomId", %{conn: conn, secret: secret} do
      body =
        Jason.encode!(%{
          "roomId" => "../etc",
          "event" => %{"type" => "room:message"}
        })

      signature = sign_body(secret, body)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", signature)
        |> post(~p"/internal/room-event", body)

      assert json_response(conn, 422) == %{"ok" => false, "reason" => "invalid_payload"}
    end

    test "422 when event is not a map", %{conn: conn, room_id: room_id, secret: secret} do
      body =
        Jason.encode!(%{
          "roomId" => room_id,
          "event" => ["not", "a", "map"]
        })

      signature = sign_body(secret, body)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", signature)
        |> post(~p"/internal/room-event", body)

      assert json_response(conn, 422) == %{"ok" => false, "reason" => "invalid_payload"}
    end

    test "422 on bad JSON", %{conn: conn, secret: secret} do
      body = "not json at all"
      signature = sign_body(secret, body)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", signature)
        |> post(~p"/internal/room-event", body)

      assert json_response(conn, 422) == %{"ok" => false, "reason" => "invalid_payload"}
    end

    test "413 when body exceeds 80_000 bytes",
         %{conn: conn, room_id: room_id, secret: secret} do
      huge = String.duplicate("x", 81_000)
      body = Jason.encode!(%{"roomId" => room_id, "event" => %{"type" => "room:message", "blob" => huge}})
      signature = sign_body(secret, body)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-roomboard-internal-signature", signature)
        |> post(~p"/internal/room-event", body)

      assert json_response(conn, 413) == %{"ok" => false, "reason" => "payload_too_large"}
    end
  end

  defp sign_body(secret, body) do
    :crypto.mac(:hmac, :sha256, secret, body)
    |> Base.url_encode64(padding: false)
  end
end
