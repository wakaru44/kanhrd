# Operating kanhrd

kanhrd's bridge (`apps/bridge`) is the only thing you deploy — the browser
never talks to herdr directly (see `docs/adr/0001-hub-bridge-ssh-tunnels.md`),
and the bridge owns no credentials of its own (see
`docs/adr/0003-delegated-auth-with-loopback-default.md`). This page covers
the three placements that combination supports: laptop-only, cloud hub, and
a mix of the two with a reverse SSH tunnel bridging them.

The bridge binds `127.0.0.1` by default. Binding on any other interface
requires an explicit `--i-know-what-im-doing` flag — that flag is your
signal that you've read this page and put a proxy in front.

## 1. Laptop-only

The simple case: bridge and herdr both run on your own machine, nothing is
exposed to the network, and there is no proxy and no auth layer to set up.

```bash
pnpm install
pnpm --filter @kanhrd/bridge dev
```

By default the bridge points at `~/.config/herdr/herdr.sock` (or
`$XDG_CONFIG_HOME/herdr/herdr.sock`) and binds `127.0.0.1`. Open the printed
URL in a browser on the same machine. Safe by default — nothing to
configure, nothing reachable off-box.

Opening a card's terminal detail view costs one `pane.read` call against
herdr per open terminal per `outputPollIntervalMs` (default 150ms) — the
bridge polls rather than receiving a push event (see
`docs/adr/0004-full-snapshot-terminal-output-via-polling.md`). No config
change is needed for the demo; if you want a cheaper cadence, set
`outputPollIntervalMs` in `kanhrd.config.yaml` to a higher value.

Lifecycle ops (`pane.close`, `tab.close`, `workspace.close`) run against
your real local herdr and do destroy real state — a closed pane loses its
scrollback, and closing a linked-worktree workspace detaches that worktree.
This is true even on a laptop-only, single-user setup with no proxy in
front. A test worktree/workspace is safer to experiment with than a pane
that's actually running an agent you care about.

## 2. Cloud hub with oauth2-proxy

Run the bridge on an always-on cloud VM so the board stays reachable when
your laptop is closed. Because the bridge is now potentially reachable from
outside the VM, it needs a proxy in front handling authentication before
any request reaches it.

Bridge config: point the host list (`{name, socket_path}`) at whatever
sockets are reachable on the VM — see recipe 3 for how a laptop's socket
gets there via reverse tunnel. Start the bridge bound to loopback, with the
explicit flag required to run non-default:

```bash
kanhrd-bridge --bind 127.0.0.1:8080 --i-know-what-im-doing
```

`oauth2-proxy` sits in front, handling SSO (Google/GitHub/etc.) and setting
a trusted identity header:

```bash
oauth2-proxy \
  --http-address=0.0.0.0:4180 \
  --upstream=http://127.0.0.1:8080/ \
  --provider=github \
  --client-id=<your-oauth-app-id> \
  --client-secret=<your-oauth-app-secret> \
  --cookie-secret=<random-32-byte-value> \
  --email-domain=* \
  --pass-user-headers=true \
  --set-xauthrequest=true
```

`nginx` (or your existing edge proxy) terminates TLS and forwards to
oauth2-proxy, which forwards to the bridge:

```nginx
server {
    listen 443 ssl;
    server_name kanhrd.example.com;

    location / {
        proxy_pass http://127.0.0.1:4180;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Both the bridge and oauth2-proxy stay bound to loopback on the VM; only
nginx is internet-facing. A Tailscale Funnel or Cloudflare Access setup
follows the same shape — proxy owns identity, bridge stays loopback-only
and reads the trusted header the proxy sets.

Tier-3 lifecycle verbs (`pane.close`, `tab.close`, `workspace.close`, and
their create/rename counterparts) are high-blast-radius on a hub reachable
from outside the VM — a mis-scoped or bypassed proxy means anyone who
reaches the bridge can destroy panes and worktree workspaces, not just view
them. Make sure whatever proxy you put in front actually requires an
authenticated user (oauth2-proxy's `--email-domain`/allowlist, Cloudflare
Access policy, etc.) rather than leaning on network placement (e.g.
"Tailscale is in front of it") as a stand-in for identity — see
`docs/adr/0003-delegated-auth-with-loopback-default.md` for why the bridge
delegates auth instead of owning it, and why that makes the proxy's policy
the actual gate.

## 3. Mixed: cloud hub + reverse-tunnelled laptop

The cloud hub (recipe 2) is always-on, but your laptop's herdr instance
still needs to appear as a local socket path to that bridge. The laptop
pushes its socket up to the cloud host over a reverse SSH tunnel; from the
bridge's perspective this is indistinguishable from a local socket.

On the laptop, forward the local herdr socket to a path on the cloud host:

```bash
ssh -N -R /home/kanhrd/sockets/laptop.sock:/home/you/.config/herdr/herdr.sock \
    kanhrd@cloud-host
```

`autossh` keeps that tunnel alive across reconnects. A systemd unit on the
laptop:

```ini
# ~/.config/systemd/user/kanhrd-tunnel.service
[Unit]
Description=kanhrd reverse tunnel to cloud hub
After=network-online.target

[Service]
Environment=AUTOSSH_GATETIME=0
ExecStart=/usr/bin/autossh -M 0 -N \
  -o "ServerAliveInterval 30" -o "ServerAliveCountMax 3" \
  -R /home/kanhrd/sockets/laptop.sock:/home/you/.config/herdr/herdr.sock \
  kanhrd@cloud-host
Restart=always

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now kanhrd-tunnel.service
```

On the cloud host, add the forwarded path to the bridge's host list:

```json
{ "name": "laptop", "socket_path": "/home/kanhrd/sockets/laptop.sock" }
```

The bridge never knows this socket arrived over a tunnel rather than being
local — that's the point of the hub-bridge design
(`docs/adr/0001-hub-bridge-ssh-tunnels.md`). If the laptop goes offline, the
socket read fails and that host shows as offline on the board; nothing
about the cloud hub or other hosts is affected.
