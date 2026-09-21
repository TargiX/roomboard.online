defmodule RoomboardRealtimeWeb.HealthController do
  use RoomboardRealtimeWeb, :controller

  def show(conn, _params) do
    json(conn, %{
      ok: true,
      service: "roomboard_realtime",
      # Lets the production health check verify the sidecar actually requires
      # signed room tokens — a release booted without the flag would otherwise
      # look healthy while accepting unauthenticated joins.
      room_auth_required:
        Application.get_env(:roomboard_realtime, :require_room_auth, false)
    })
  end
end
