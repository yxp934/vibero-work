

webconsole-commands-usage-block =
  :block URL_STRING

  Start blocking network requests

    It accepts only one URL_STRING argument, an unquoted string which will be used to block all requests whose URL includes this string.
    Use :unblock or the Network Monitor request blocking sidebar to undo this.

webconsole-commands-usage-unblock =
  :unblock URL_STRING

  Stop blocking network requests

    It accepts only one argument, the exact same string previously passed to :block.
