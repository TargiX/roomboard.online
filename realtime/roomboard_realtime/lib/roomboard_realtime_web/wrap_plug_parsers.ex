defmodule RoomboardRealtimeWeb.WrapPlugParsers do
  @moduledoc """
  Wraps the endpoint's `Plug.Parsers` so a malformed JSON body on the
  internal-event endpoint surfaces as a 422 (handled in the controller) rather
  than a 400 raised by `Plug.Parsers.ParseError`. The raw body is still cached
  on `conn.assigns.raw_body` by `RoomboardRealtimeWeb.CacheBodyReader` so the
  controller can HMAC-verify the exact bytes the caller signed.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, opts) do
    Plug.Parsers.call(conn, Plug.Parsers.init(opts))
  rescue
    error in Plug.Parsers.ParseError ->
      # Stash the parser error so the internal-event controller can convert
      # it into a 422 instead of the default 400. Don't halt: the controller
      # needs to run to render that response itself.
      assign(conn, :plug_parser_error, error)
  end
end
