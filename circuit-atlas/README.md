# Circuit Atlas

Document a home's panels, breakers, circuits, gang boxes, switches,
receptacles, fixtures, bulbs, appliances, cables, and individual conductors in
one private, local-first web app.

Circuit Atlas can answer both directions of the most important lookup:

- Select a breaker to see every connected switch, receptacle, light, and appliance.
- Select a device or fixture to trace its supply back to the breaker.

It also models arbitrary n-way switching, many-to-many switch/load
relationships, conductor-level connections, optional wire gauge, cable entry
positions in gang-box diagrams, smart-device identifiers, upgrade plans, and
floor-plan locations.

All property information is stored in the Home Assistant app's private `/data`
volume. The source code contains no house-specific records.

See the **Documentation** tab after installation for setup, Cloudflare Access,
backup, privacy, and troubleshooting instructions.
