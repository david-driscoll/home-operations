# Home Operations

The estate: the clusters, Dockge hosts and networks this repo runs, and how people and devices reach them. Terms are grouped by area. Each area grows as its terms settle.

## Client access (NetBird and Tailscale)

**Client device**:
A person's phone, laptop or TV that reaches the estate as a user, not as a server.
_Avoid_: Endpoint, node (when you mean a person's device)

**Device name**:
A NetBird device's own name, `<device>.nbd.<root domain>`, which other NetBird devices can reach it by.
_Avoid_: Peer FQDN, NetBird hostname

**Backplane**:
The servers and the traffic between them (storage, secrets, monitoring, admin). It stays on Tailscale and is never offered to client devices.
_Avoid_: Infrastructure network, server mesh

**User group**:
One of the four groups a person belongs to (admins, family, friends, media-managers). It decides what their client devices may reach.
_Avoid_: Role (a NetBird role is a different thing), team

**Device group**:
A group a device joins because of how it enrolled rather than who owns it: gateways, Apple TVs, DNS servers, in-cluster routers.
_Avoid_: Tag (that is the Tailscale word)

**Self group**:
A group holding exactly one person's own devices, so those devices can reach each other and nobody else's.
_Avoid_: Personal group, user group

**Invite**:
A time-limited link that creates one person's NetBird login and places them in their user group.
_Avoid_: Signup link, setup-key link

**Setup key**:
A shared secret that enrols a device without a person logging in, placing it in a device group.
_Avoid_: Auth key (that is the Tailscale word), enrolment token

**Gateway**:
A NetBird peer on a Dockge host that carries client traffic into its site's LAN. The gateways of one Dockge site stack (home, gulf-of-mexico, ocracoke) form one group and together serve as one exit node.
_Avoid_: Subnet router, routing peer (when you mean a home gateway), bridge

**In-cluster router**:
A NetBird peer running inside Equestria that offers a second way to the cluster's entry points when the gateways are down, and a further way out through the home exit node.
_Avoid_: Operator, k8s gateway

**Site LAN**:
The local network at one physical site (home, ocracoke, alpha-site's), reached through that site's gateways.
_Avoid_: Subnet, VLAN

**Exit node**:
A site's way out to the internet that a client device may choose to send all of its internet traffic through: that site stack's gateways, plus the in-cluster routers for home. The client uses whichever of them it reaches best.
_Avoid_: VPN server, egress

**Relay**:
A server that forwards encrypted traffic between two peers that cannot connect directly.
_Avoid_: TURN server, DERP (Tailscale's equivalent)

**Home relay**:
The relay at home, whose name only resolves through the estate's private DNS.
_Avoid_: Peer relay (Tailscale's feature, which NetBird does not have)

**Management server**:
The NetBird control plane: it holds the account, the peers, the policy and the logins. Only one host runs it at a time.
_Avoid_: Coordinator, controller, NetBird server (ambiguous with relays)

**Primary host**:
The edge host that normally runs the management server.
_Avoid_: Master, main server

**Standby host**:
The edge host that stays passive, ready to take over the management server on failover.
_Avoid_: Replica, secondary (it holds no live copy)

**DNS lease**:
The public record for the management server's name. Whichever host it points to is the one allowed to run the management server.
_Avoid_: Lock, leader election

**Fence**:
A host's refusal to run the management server unless the DNS lease points at it.
_Avoid_: Guard, lockout

**Failover**:
Moving the DNS lease from the primary host to the standby host because the primary has failed. It happens automatically.
_Avoid_: Switchover (a planned move)

**Promotion**:
A host starting its management server because the DNS lease now points at it, after first restoring the newest snapshot.
_Avoid_: Takeover, election

**Demotion**:
A host stopping its management server, and dropping the client connections it held, because the DNS lease no longer points at it. Part of every failover and failback.
_Avoid_: Shutdown, fail-out

**Failback**:
The deliberate, manual return of the DNS lease to the primary host after a failover.
_Avoid_: Restore, revert

**DNS sidecar**:
A NetBird peer living next to a Technitium server, so client devices can query that server directly over NetBird.
_Avoid_: DNS gateway, resolver peer

## Apps and their names

**App route**:
An app's name under the root domain (`<app>.<root domain>`), reached on the LAN or through a gateway.
_Avoid_: Internal URL, LAN URL

**Tailnet route**:
An app's name on the tailnet (`<app>.<tailnet>`), reached only from Tailscale.
_Avoid_: Tailscale URL, MagicDNS name (when you mean an app)

**App service**:
An app's NetBird-only name (`<app>.app.<root domain>`), reachable only from NetBird devices in the app's access policy groups.
_Avoid_: NetBird URL, private service (NetBird's general mechanism, of which this is one use)

**Access policy**:
The list of user groups an app declares in its definition as allowed to use it. An app that declares none gets no app service.
_Avoid_: ACL, permissions

**Proxy cluster**:
The NetBird reverse proxy in Equestria that serves app services and nbidp, known by its cluster address `ek.<root domain>`.
_Avoid_: nbidp (that is one service it serves), ingress

**nbidp**:
The passwordless "log in with NetBird" path on Authentik, which recognises a person by the NetBird device they are using.
_Avoid_: NetBird SSO, NetBird login (that is NetBird's own login)
