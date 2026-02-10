param([int]$Port = 8080)

$ErrorActionPreference = "Stop"
$Tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$Site  = Split-Path -Parent $Tools

function Get-MimeType([string]$Path){
  switch -Regex ($Path.ToLower()){
    "\.html$" { "text/html; charset=utf-8"; break }
    "\.css$"  { "text/css; charset=utf-8"; break }
    "\.js$"   { "application/javascript; charset=utf-8"; break }
    "\.json$" { "application/json; charset=utf-8"; break }
    "\.txt$"  { "text/plain; charset=utf-8"; break }
    default { "application/octet-stream" }
  }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add(("http://localhost:{0}/" -f $Port))
$listener.Start()
Write-Host ("[server] http://localhost:{0}/index.html" -f $Port)
Start-Process ("http://localhost:{0}/index.html" -f $Port) | Out-Null

try {
  while($listener.IsListening){
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    $raw = $req.Url.AbsolutePath.TrimStart("/")
    if([string]::IsNullOrWhiteSpace($raw)){ $raw = "index.html" }

    $decoded = [System.Uri]::UnescapeDataString($raw)
    $decoded = $decoded -replace "/", "\"

    $file = Join-Path $Site $decoded

    if(Test-Path $file -PathType Leaf){
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $res.ContentType = Get-MimeType $file
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - Not Found: " + $raw)
      $res.ContentType = "text/plain; charset=utf-8"
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.OutputStream.Close()
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
