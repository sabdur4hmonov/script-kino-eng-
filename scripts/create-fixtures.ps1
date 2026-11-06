$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$mediaPath = Join-Path $projectPath 'test-media'
New-Item -ItemType Directory -Path $mediaPath -Force | Out-Null
$subtitlePath = Join-Path $mediaPath 'sample.srt'
@'
1
00:00:01,000 --> 00:00:03,000
Don't forget your twenty tickets.

2
00:00:05,000 --> 00:00:07,000
We are going home tonight.

3
00:00:09,000 --> 00:00:11,000
Practice makes progress.
'@ | Set-Content -LiteralPath $subtitlePath -Encoding utf8
@'
WEBVTT

first
00:01.000 --> 00:03.000
Don't
forget your
twenty tickets.

second
00:05.000 --> 00:07.000
We are going home tonight.

third
00:09.000 --> 00:11.000
Practice makes progress.
'@ | Set-Content -LiteralPath (Join-Path $mediaPath 'sample.vtt') -Encoding utf8
$basePath = Join-Path $mediaPath 'base.mp4'
& ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=c=0x25202f:s=640x360:r=24:d=12' -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=12' -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest $basePath
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg base fixture failed' }
& ffmpeg -hide_banner -loglevel error -y -i $basePath -i $subtitlePath -map 0 -map 1 -c copy -c:s mov_text -metadata:s:s:0 language=eng (Join-Path $mediaPath 'sample.mp4')
if ($LASTEXITCODE -ne 0) { throw 'MP4 fixture failed' }
& ffmpeg -hide_banner -loglevel error -y -i $basePath -i $subtitlePath -map 0 -map 1 -map 1 -c copy -c:s srt -metadata:s:s:0 language=rus -metadata:s:s:1 language=eng (Join-Path $mediaPath 'sample-srt.mkv')
if ($LASTEXITCODE -ne 0) { throw 'SRT MKV fixture failed' }
& ffmpeg -hide_banner -loglevel error -y -i $basePath -i $subtitlePath -map 0 -map 1 -c copy -c:s ass -metadata:s:s:0 language=eng (Join-Path $mediaPath 'sample-ass.mkv')
if ($LASTEXITCODE -ne 0) { throw 'ASS MKV fixture failed' }
& ffmpeg -hide_banner -loglevel error -y -i $basePath -i $subtitlePath -map 0 -map 1 -c:v copy -c:a ac3 -c:s srt -metadata:s:s:0 language=eng (Join-Path $mediaPath 'sample-ac3.mkv')
if ($LASTEXITCODE -ne 0) { throw 'AC3 fixture failed' }
Write-Output "Synthetic fixtures created in $mediaPath (tone audio, not a film)."
& ffmpeg -hide_banner -loglevel error -y -i $basePath -i (Join-Path $mediaPath 'sample.vtt') -map 0 -map 1 -c copy -c:s webvtt -metadata:s:s:0 language=eng (Join-Path $mediaPath 'sample-vtt.mkv')
if ($LASTEXITCODE -ne 0) { throw 'WebVTT MKV fixture failed' }
