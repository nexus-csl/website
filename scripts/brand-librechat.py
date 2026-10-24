"""Apply Nexus branding to an extracted LibreChat client distribution.
Run from the Compose project directory after extracting client/dist to branding/site.
This changes presentation only and does not activate integrations or staff permissions.
"""
from pathlib import Path
import re, json, gzip
base = Path.cwd()
site = base / "branding/site"
(site / "assets/nexus-csl-logo.svg").write_bytes((site / "assets/logo.svg").read_bytes())
p = site / "index.html"
s = p.read_text()
s = re.sub(r"<title>.*?</title>", "<title>Private Nexus CSL AI Chat</title>", s)
s = s.replace("LibreChat - An open source chat application with support for multiple AI models", "Private Nexus CSL AI Chat for authorized CSL users")
s = re.sub(r'<link rel="(?:icon|apple-touch-icon)"[^>]*>', "", s)
if "assets/nexus-brand.css" not in s:
    s = s.replace("</head>", '<link rel="icon" type="image/svg+xml" href="assets/nexus-csl-favicon.svg?v=1"/><link rel="stylesheet" href="assets/nexus-brand.css?v=2"/></head>')
s = s.replace("nexus-brand.css?v=1", "nexus-brand.css?v=2")
p.write_text(s)
(site / "index.html.gz").write_bytes(gzip.compress(s.encode()))
(site / "index.html.br").unlink(missing_ok=True)
p = site / "manifest.webmanifest"
m = json.loads(p.read_text())
m.update(name="Private Nexus CSL AI Chat", short_name="Nexus CSL", icons=[{"src":"/assets/nexus-csl-favicon.svg","sizes":"any","type":"image/svg+xml","purpose":"any"}])
p.write_text(json.dumps(m))
for name in ["manifest.webmanifest.gz", "manifest.webmanifest.br"]:
    (site / name).unlink(missing_ok=True)
p = base / "production.env"
s = p.read_text()
for k, v in [("APP_TITLE", "Private Nexus CSL AI Chat"), ("CUSTOM_FOOTER", "Private Nexus CSL AI Chat | Authorized CSL users"), ("SCHEDULES_SINGLE_PROCESS", "true")]:
    s = re.sub(r"^" + k + r"=.*$", k + "=" + v, s, flags=re.M) if re.search(r"^" + k + "=", s, re.M) else s.rstrip() + "\n" + k + "=" + v + "\n"
p.write_text(s)
p.chmod(0o600)
(base / "librechat.yaml").write_text("version: 1.3.18\ncache: true\ninterface:\n  customWelcome: Private Nexus CSL AI Chat\n")
p = base / "compose.yaml"
s = p.read_text()
marker = "      - ./images:/app/client/public/images"
assert marker in s, "Expected Compose images mount missing"
if "./branding/site:/app/client/dist:ro" not in s:
    s = s.replace(marker, "      - ./branding/site:/app/client/dist:ro\n      - ./librechat.yaml:/app/librechat.yaml:ro\n" + marker)
if "./branding/site/assets/logo.svg:/app/client/public/assets/logo.svg:ro" not in s:
    s = s.replace(marker, "      - ./branding/site/assets/logo.svg:/app/client/public/assets/logo.svg:ro\n" + marker)
p.write_text(s)
print("BRANDING_CONFIG_READY")
