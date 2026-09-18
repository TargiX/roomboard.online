defmodule RoomboardRealtimeWeb.RoomChannelTest do
  use RoomboardRealtimeWeb.ChannelCase, async: false

  alias RoomboardRealtimeWeb.UserSocket

  setup do
    room_id = "room-#{System.unique_integer([:positive])}"

    {:ok, socket} =
      connect(UserSocket, %{
        "id" => "user-1",
        "name" => "Ada",
        "color" => "#0ea5e9"
      })

    %{room_id: room_id, socket: socket}
  end

  defp signed_access_token(room_id, secret, exp \\ System.system_time(:millisecond) + 60_000, role \\ "editor") do
    payload =
      %{
        "exp" => exp,
        "role" => role,
        "roomId" => room_id,
        "v" => "rb1"
      }
      |> Jason.encode!()
      |> Base.url_encode64(padding: false)

    signature =
      :crypto.mac(:hmac, :sha256, secret, payload)
      |> Base.url_encode64(padding: false)

    "#{payload}.#{signature}"
  end

  test "joins a room and pushes initial presence", %{room_id: room_id, socket: socket} do
    {:ok, %{roomId: ^room_id}, socket} =
      subscribe_and_join(socket, "room:#{room_id}", %{
        "focus" => "sticky:one",
        "x" => 10,
        "y" => 20
      })

    assert socket.assigns.room_id == room_id
    assert socket.assigns.focus == "sticky:one"
    assert_push "presence_state", %{"user-1" => %{metas: [presence]}}
    assert presence.name == "Ada"
    assert presence.color == "#0ea5e9"
    assert presence.focus == "sticky:one"
    assert presence.x == 10
    assert presence.y == 20
  end

  test "rejects invalid room ids", %{socket: socket} do
    assert {:error, %{reason: "invalid_room"}} =
             subscribe_and_join(socket, "room:../../nope", %{})
  end

  test "requires a signed access token when realtime auth is configured", %{
    room_id: room_id,
    socket: socket
  } do
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

    assert {:error, %{reason: "unauthorized_room"}} =
             subscribe_and_join(socket, "room:#{room_id}", %{})

    assert {:error, %{reason: "unauthorized_room"}} =
             subscribe_and_join(socket, "room:#{room_id}", %{"accessToken" => "bad.token"})

    token = signed_access_token(room_id, secret)

    assert {:ok, %{roomId: ^room_id}, _socket} =
             subscribe_and_join(socket, "room:#{room_id}", %{"accessToken" => token})
  end

  test "rejects a signed token whose role is not a string", %{
    room_id: room_id,
    socket: socket
  } do
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

    non_string_roles = [nil, 1, true, ["editor"]]

    for role <- non_string_roles do
      token = signed_access_token(room_id, secret, System.system_time(:millisecond) + 60_000, role)

      assert {:error, %{reason: "unauthorized_room"}} =
               subscribe_and_join(socket, "room:#{room_id}", %{"accessToken" => token}),
             "role #{inspect(role)} must be rejected"
    end
  end

  test "updates presence without retracking", %{room_id: room_id, socket: socket} do
    {:ok, _reply, socket} = subscribe_and_join(socket, "room:#{room_id}", %{})
    assert_push "presence_state", _

    ref =
      push(socket, "presence:update", %{
        "focus" => "comment:alpha",
        "x" => 48,
        "y" => 96
      })

    assert_reply ref, :ok, %{presence: presence}
    assert presence.focus == "comment:alpha"
    assert presence.x == 48
    assert presence.y == 96

    assert_broadcast "presence:update", %{
      id: "user-1",
      focus: "comment:alpha",
      x: 48,
      y: 96
    }
  end

  test "broadcasts room events with room metadata", %{room_id: room_id, socket: socket} do
    {:ok, _reply, socket} = subscribe_and_join(socket, "room:#{room_id}", %{})
    assert_push "presence_state", _

    ref =
      push(socket, "room:event", %{
        "type" => "item:created",
        "clientId" => "client-a",
        "item" => %{"id" => "note-1", "type" => "note", "text" => "hello"}
      })

    assert_reply ref, :ok, %{
      "type" => "item:created",
      "clientId" => "client-a",
      "roomId" => ^room_id,
      "sentAt" => sent_at
    }

    assert is_integer(sent_at)

    assert_broadcast "room:event", %{
      "type" => "item:created",
      "clientId" => "client-a",
      "roomId" => ^room_id,
      "sentAt" => ^sent_at
    }
  end

  test "broadcasts board mutation payloads", %{room_id: room_id, socket: socket} do
    {:ok, _reply, socket} = subscribe_and_join(socket, "room:#{room_id}", %{})
    assert_push "presence_state", _

    ref =
      push(socket, "room:event", %{
        "type" => "comment:created",
        "clientId" => "client-a",
        "itemId" => "note-1",
        "comment" => %{
          "id" => "comment-1",
          "author" => "Ada",
          "body" => "Ship it",
          "color" => "#0ea5e9",
          "createdAt" => 123
        }
      })

    assert_reply ref, :ok, %{
      "type" => "comment:created",
      "clientId" => "client-a",
      "itemId" => "note-1",
      "comment" => %{"id" => "comment-1"},
      "roomId" => ^room_id
    }

    assert_broadcast "room:event", %{
      "type" => "comment:created",
      "clientId" => "client-a",
      "itemId" => "note-1",
      "comment" => %{"id" => "comment-1"},
      "roomId" => ^room_id
    }
  end

  test "rejects unsupported board event types", %{room_id: room_id, socket: socket} do
    {:ok, _reply, socket} = subscribe_and_join(socket, "room:#{room_id}", %{})
    assert_push "presence_state", _

    ref =
      push(socket, "room:event", %{
        "type" => "unknown:event",
        "clientId" => "client-a"
      })

    assert_reply ref, :error, %{reason: "unsupported_type"}
  end

  test "rejects oversized board event payloads", %{room_id: room_id, socket: socket} do
    {:ok, _reply, socket} = subscribe_and_join(socket, "room:#{room_id}", %{})
    assert_push "presence_state", _

    ref =
      push(socket, "room:event", %{
        "type" => "item:updated",
        "item" => %{
          "id" => "note-1",
          "body" => String.duplicate("x", 81_000)
        }
      })

    assert_reply ref, :error, %{reason: "payload_too_large"}
  end
end
