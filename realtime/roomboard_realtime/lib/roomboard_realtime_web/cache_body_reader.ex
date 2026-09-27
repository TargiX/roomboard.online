defmodule RoomboardRealtimeWeb.CacheBodyReader do
  @moduledoc """
  Plug body reader that caches the raw request bytes on `conn.assigns.raw_body`
  before handing control to `Plug.Parsers`.

  The internal-event controller verifies an HMAC over the exact body the caller
  signed, so we cannot rely on the decoded params (which lose key ordering and
  can be reformatted by the JSON parser).
  """

  import Plug.Conn

  def read_body(conn, opts) do
    {:ok, body, conn} = Plug.Conn.read_body(conn, opts)
    conn = assign(conn, :raw_body, body)
    {:ok, body, conn}
  end
end
