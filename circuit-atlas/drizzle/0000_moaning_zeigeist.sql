CREATE TABLE `appliances` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`connection_kind` text DEFAULT 'unknown' NOT NULL,
	`smart_state` text DEFAULT 'unknown' NOT NULL,
	`rated_watts` real,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "appliances_connection_kind_ck" CHECK("appliances"."connection_kind" in ('hardwired', 'plug_connected', 'unknown', 'custom')),
	CONSTRAINT "appliances_smart_state_ck" CHECK("appliances"."smart_state" in ('smart', 'dumb', 'unknown', 'not_applicable')),
	CONSTRAINT "appliances_watts_ck" CHECK("appliances"."rated_watts" is null or "appliances"."rated_watts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appliances_property_asset_uq` ON `appliances` (`property_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `asset_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`alias` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `asset_aliases_property_alias_idx` ON `asset_aliases` (`property_id`,`alias`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_aliases_property_id_id_uq` ON `asset_aliases` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_aliases_property_asset_alias_uq` ON `asset_aliases` (`property_id`,`asset_id`,`alias`);--> statement-breakpoint
CREATE TABLE `asset_circuit_assertions` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`asset_function_id` text,
	`circuit_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`certainty` text DEFAULT 'unknown' NOT NULL,
	`evidence_id` text,
	`notes` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`asset_id`,`asset_function_id`) REFERENCES `asset_functions`(`property_id`,`asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`circuit_id`) REFERENCES `circuits`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`evidence_id`) REFERENCES `evidence`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "asset_circuit_assertions_status_ck" CHECK("asset_circuit_assertions"."status" in ('active', 'superseded', 'rejected', 'conflicting')),
	CONSTRAINT "asset_circuit_assertions_certainty_ck" CHECK("asset_circuit_assertions"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "asset_circuit_assertions_revision_ck" CHECK("asset_circuit_assertions"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `asset_circuit_assertions_asset_idx` ON `asset_circuit_assertions` (`property_id`,`asset_id`,`status`);--> statement-breakpoint
CREATE INDEX `asset_circuit_assertions_circuit_idx` ON `asset_circuit_assertions` (`property_id`,`circuit_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_circuit_assertions_property_id_id_uq` ON `asset_circuit_assertions` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `asset_functions` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`function_key` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`channel_number` integer,
	`notes` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "asset_functions_kind_ck" CHECK("asset_functions"."kind" in ('switch_channel', 'dimmer_channel', 'receptacle_half', 'relay_channel', 'fixture_light_load', 'fan_motor', 'lamp_holder', 'scene_button', 'appliance_load', 'sensor_output', 'custom')),
	CONSTRAINT "asset_functions_channel_ck" CHECK("asset_functions"."channel_number" is null or "asset_functions"."channel_number" >= 1),
	CONSTRAINT "asset_functions_lifecycle_ck" CHECK("asset_functions"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "asset_functions_revision_ck" CHECK("asset_functions"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `asset_functions_asset_kind_idx` ON `asset_functions` (`property_id`,`asset_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_functions_property_id_id_uq` ON `asset_functions` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_functions_property_asset_id_uq` ON `asset_functions` (`property_id`,`asset_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_functions_property_asset_key_uq` ON `asset_functions` (`property_id`,`asset_id`,`function_key`);--> statement-breakpoint
CREATE TABLE `asset_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`structure_id` text,
	`level_id` text,
	`space_id` text,
	`wall_zone_id` text,
	`locator_label` text,
	`height` real,
	`height_unit` text,
	`certainty` text DEFAULT 'unknown' NOT NULL,
	`evidence_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`structure_id`) REFERENCES `structures`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`level_id`) REFERENCES `levels`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`space_id`) REFERENCES `spaces`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`wall_zone_id`) REFERENCES `wall_zones`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`evidence_id`) REFERENCES `evidence`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "asset_locations_certainty_ck" CHECK("asset_locations"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "asset_locations_height_unit_ck" CHECK("asset_locations"."height_unit" is null or "asset_locations"."height_unit" in ('in', 'ft', 'mm', 'cm', 'm')),
	CONSTRAINT "asset_locations_revision_ck" CHECK("asset_locations"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `asset_locations_room_inventory_idx` ON `asset_locations` (`property_id`,`space_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_locations_property_id_id_uq` ON `asset_locations` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_locations_property_asset_uq` ON `asset_locations` (`property_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `asset_mount_positions` (
	`property_id` text NOT NULL,
	`mount_id` text NOT NULL,
	`box_asset_id` text NOT NULL,
	`gang_index` integer NOT NULL,
	PRIMARY KEY(`property_id`, `mount_id`, `gang_index`),
	FOREIGN KEY (`property_id`,`box_asset_id`,`mount_id`) REFERENCES `asset_mounts`(`property_id`,`box_asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "asset_mount_positions_gang_ck" CHECK("asset_mount_positions"."gang_index" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_mount_positions_box_gang_uq` ON `asset_mount_positions` (`property_id`,`box_asset_id`,`gang_index`);--> statement-breakpoint
CREATE TABLE `asset_mounts` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`box_asset_id` text NOT NULL,
	`mounted_asset_id` text NOT NULL,
	`start_gang_index` integer NOT NULL,
	`gang_span` integer DEFAULT 1 NOT NULL,
	`vertical_position` real DEFAULT 0.5 NOT NULL,
	`rotation_degrees` real DEFAULT 0 NOT NULL,
	`face_label` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`box_asset_id`) REFERENCES `boxes`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`mounted_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "asset_mounts_start_gang_ck" CHECK("asset_mounts"."start_gang_index" >= 1),
	CONSTRAINT "asset_mounts_gang_span_ck" CHECK("asset_mounts"."gang_span" >= 1),
	CONSTRAINT "asset_mounts_vertical_ck" CHECK("asset_mounts"."vertical_position" >= 0 and "asset_mounts"."vertical_position" <= 1),
	CONSTRAINT "asset_mounts_revision_ck" CHECK("asset_mounts"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `asset_mounts_box_idx` ON `asset_mounts` (`property_id`,`box_asset_id`,`start_gang_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_mounts_property_id_id_uq` ON `asset_mounts` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_mounts_property_box_id_uq` ON `asset_mounts` (`property_id`,`box_asset_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_mounts_asset_uq` ON `asset_mounts` (`property_id`,`mounted_asset_id`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`permanent_code` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`notes` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "assets_kind_ck" CHECK("assets"."kind" in ('panel', 'box', 'device', 'fixture', 'appliance', 'light_source', 'cable', 'junction_point', 'custom')),
	CONSTRAINT "assets_lifecycle_ck" CHECK("assets"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "assets_revision_ck" CHECK("assets"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `assets_property_kind_state_idx` ON `assets` (`property_id`,`kind`,`lifecycle_state`);--> statement-breakpoint
CREATE INDEX `assets_property_name_idx` ON `assets` (`property_id`,`display_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `assets_property_id_id_uq` ON `assets` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assets_property_permanent_code_uq` ON `assets` (`property_id`,`permanent_code`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`original_file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text,
	`width_pixels` integer,
	`height_pixels` integer,
	`page_count` integer,
	`alt_text` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "attachments_lifecycle_ck" CHECK("attachments"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "attachments_byte_size_ck" CHECK("attachments"."byte_size" >= 0),
	CONSTRAINT "attachments_width_ck" CHECK("attachments"."width_pixels" is null or "attachments"."width_pixels" > 0),
	CONSTRAINT "attachments_height_ck" CHECK("attachments"."height_pixels" is null or "attachments"."height_pixels" > 0),
	CONSTRAINT "attachments_page_count_ck" CHECK("attachments"."page_count" is null or "attachments"."page_count" > 0),
	CONSTRAINT "attachments_revision_ck" CHECK("attachments"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_object_key_uq` ON `attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX `attachments_owner_idx` ON `attachments` (`property_id`,`owner_type`,`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_property_id_id_uq` ON `attachments` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `bond_points` (
	`electrical_node_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`box_asset_id` text,
	`owning_asset_id` text,
	`description` text,
	FOREIGN KEY (`property_id`,`electrical_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`box_asset_id`) REFERENCES `boxes`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`owning_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bond_points_owner_ck" CHECK("bond_points"."box_asset_id" is not null or "bond_points"."owning_asset_id" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bond_points_property_node_uq` ON `bond_points` (`property_id`,`electrical_node_id`);--> statement-breakpoint
CREATE TABLE `box_ports` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`box_asset_id` text NOT NULL,
	`side` text NOT NULL,
	`offset_normalized` real DEFAULT 0.5 NOT NULL,
	`knockout_label` text,
	`notes` text,
	FOREIGN KEY (`property_id`,`box_asset_id`) REFERENCES `boxes`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "box_ports_side_ck" CHECK("box_ports"."side" in ('top', 'bottom', 'left', 'right', 'back')),
	CONSTRAINT "box_ports_offset_ck" CHECK("box_ports"."offset_normalized" >= 0 and "box_ports"."offset_normalized" <= 1)
);
--> statement-breakpoint
CREATE INDEX `box_ports_box_side_idx` ON `box_ports` (`property_id`,`box_asset_id`,`side`,`offset_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_ports_property_id_id_uq` ON `box_ports` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_ports_property_box_id_uq` ON `box_ports` (`property_id`,`box_asset_id`,`id`);--> statement-breakpoint
CREATE TABLE `boxes` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`box_kind` text DEFAULT 'unknown' NOT NULL,
	`material` text DEFAULT 'unknown' NOT NULL,
	`gang_count` integer DEFAULT 1 NOT NULL,
	`orientation` text DEFAULT 'unknown' NOT NULL,
	`width` real,
	`height` real,
	`depth` real,
	`dimension_unit` text,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "boxes_kind_ck" CHECK("boxes"."box_kind" in ('device', 'junction', 'fixture', 'panel', 'floor', 'weatherproof', 'other', 'unknown')),
	CONSTRAINT "boxes_material_ck" CHECK("boxes"."material" in ('plastic', 'metal', 'fiberglass', 'other', 'unknown')),
	CONSTRAINT "boxes_gang_count_ck" CHECK("boxes"."gang_count" >= 1),
	CONSTRAINT "boxes_orientation_ck" CHECK("boxes"."orientation" in ('portrait', 'landscape', 'square', 'custom', 'unknown')),
	CONSTRAINT "boxes_width_ck" CHECK("boxes"."width" is null or "boxes"."width" > 0),
	CONSTRAINT "boxes_height_ck" CHECK("boxes"."height" is null or "boxes"."height" > 0),
	CONSTRAINT "boxes_depth_ck" CHECK("boxes"."depth" is null or "boxes"."depth" > 0),
	CONSTRAINT "boxes_dimension_unit_ck" CHECK("boxes"."dimension_unit" is null or "boxes"."dimension_unit" in ('in', 'mm', 'cm'))
);
--> statement-breakpoint
CREATE INDEX `boxes_property_gang_idx` ON `boxes` (`property_id`,`gang_count`);--> statement-breakpoint
CREATE UNIQUE INDEX `boxes_property_asset_uq` ON `boxes` (`property_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `breaker_poles` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`panel_asset_id` text NOT NULL,
	`breaker_id` text NOT NULL,
	`panel_position_id` text NOT NULL,
	`pole_index` integer NOT NULL,
	`phase_leg` text DEFAULT 'unknown' NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`panel_asset_id`,`breaker_id`) REFERENCES `breakers`(`property_id`,`panel_asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`panel_asset_id`,`panel_position_id`) REFERENCES `panel_positions`(`property_id`,`panel_asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "breaker_poles_index_ck" CHECK("breaker_poles"."pole_index" >= 1),
	CONSTRAINT "breaker_poles_phase_leg_ck" CHECK("breaker_poles"."phase_leg" in ('L1', 'L2', 'L3', 'N', 'unknown', 'custom'))
);
--> statement-breakpoint
CREATE INDEX `breaker_poles_panel_idx` ON `breaker_poles` (`property_id`,`panel_asset_id`,`panel_position_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `breaker_poles_property_id_id_uq` ON `breaker_poles` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `breaker_poles_breaker_index_uq` ON `breaker_poles` (`property_id`,`breaker_id`,`pole_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `breaker_poles_position_uq` ON `breaker_poles` (`property_id`,`panel_position_id`);--> statement-breakpoint
CREATE TABLE `breakers` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`panel_asset_id` text NOT NULL,
	`permanent_code` text NOT NULL,
	`label` text NOT NULL,
	`rating_amps` integer,
	`pole_count` integer DEFAULT 1 NOT NULL,
	`kind` text DEFAULT 'unknown' NOT NULL,
	`has_afci` integer DEFAULT false NOT NULL,
	`has_gfci` integer DEFAULT false NOT NULL,
	`handle_tie_group` text,
	`notes` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`panel_asset_id`) REFERENCES `panels`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "breakers_rating_ck" CHECK("breakers"."rating_amps" is null or "breakers"."rating_amps" > 0),
	CONSTRAINT "breakers_pole_count_ck" CHECK("breakers"."pole_count" >= 1),
	CONSTRAINT "breakers_kind_ck" CHECK("breakers"."kind" in ('standard', 'gfci', 'afci', 'dual_function', 'main', 'tandem', 'quad', 'other', 'unknown')),
	CONSTRAINT "breakers_lifecycle_ck" CHECK("breakers"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "breakers_revision_ck" CHECK("breakers"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `breakers_panel_state_idx` ON `breakers` (`property_id`,`panel_asset_id`,`lifecycle_state`);--> statement-breakpoint
CREATE UNIQUE INDEX `breakers_property_id_id_uq` ON `breakers` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `breakers_property_panel_id_uq` ON `breakers` (`property_id`,`panel_asset_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `breakers_property_code_uq` ON `breakers` (`property_id`,`permanent_code`);--> statement-breakpoint
CREATE TABLE `cable_ends` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`cable_asset_id` text NOT NULL,
	`designation` text NOT NULL,
	`box_asset_id` text,
	`endpoint_asset_id` text,
	`box_port_id` text,
	`certainty` text DEFAULT 'unknown' NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`cable_asset_id`) REFERENCES `cables`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`box_asset_id`) REFERENCES `boxes`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`endpoint_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`box_asset_id`,`box_port_id`) REFERENCES `box_ports`(`property_id`,`box_asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cable_ends_designation_ck" CHECK("cable_ends"."designation" in ('A', 'B')),
	CONSTRAINT "cable_ends_certainty_ck" CHECK("cable_ends"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "cable_ends_port_requires_box_ck" CHECK("cable_ends"."box_port_id" is null or "cable_ends"."box_asset_id" is not null)
);
--> statement-breakpoint
CREATE INDEX `cable_ends_box_idx` ON `cable_ends` (`property_id`,`box_asset_id`);--> statement-breakpoint
CREATE INDEX `cable_ends_endpoint_asset_idx` ON `cable_ends` (`property_id`,`endpoint_asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cable_ends_property_id_id_uq` ON `cable_ends` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cable_ends_cable_designation_uq` ON `cable_ends` (`property_id`,`cable_asset_id`,`designation`);--> statement-breakpoint
CREATE TABLE `cables` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`wiring_method` text DEFAULT 'unknown' NOT NULL,
	`custom_wiring_method` text,
	`jacket_marking` text,
	`insulated_conductor_count` integer,
	`equipment_ground_count` integer,
	`gauge` text,
	`notes` text,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cables_wiring_method_ck" CHECK("cables"."wiring_method" in ('NM-B', 'UF-B', 'MC', 'AC', 'FMC', 'LFMC', 'EMT', 'RMC', 'IMC', 'conduit', 'unknown', 'custom')),
	CONSTRAINT "cables_custom_method_ck" CHECK("cables"."wiring_method" <> 'custom' or length(trim("cables"."custom_wiring_method")) > 0),
	CONSTRAINT "cables_insulated_count_ck" CHECK("cables"."insulated_conductor_count" is null or "cables"."insulated_conductor_count" >= 0),
	CONSTRAINT "cables_ground_count_ck" CHECK("cables"."equipment_ground_count" is null or "cables"."equipment_ground_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `cables_property_method_idx` ON `cables` (`property_id`,`wiring_method`);--> statement-breakpoint
CREATE UNIQUE INDEX `cables_property_asset_uq` ON `cables` (`property_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `capture_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`current_step` text,
	`target_type` text,
	`target_id` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`last_request_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "capture_drafts_status_ck" CHECK("capture_drafts"."status" in ('in_progress', 'ready_for_review', 'completed', 'abandoned')),
	CONSTRAINT "capture_drafts_payload_json_ck" CHECK(json_valid("capture_drafts"."payload_json")),
	CONSTRAINT "capture_drafts_revision_ck" CHECK("capture_drafts"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `capture_drafts_status_idx` ON `capture_drafts` (`property_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `capture_drafts_property_id_id_uq` ON `capture_drafts` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `change_events` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`actor_subject` text,
	`event_kind` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_revision` integer,
	`request_id` text,
	`summary` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "change_events_kind_ck" CHECK("change_events"."event_kind" in ('create', 'update', 'archive', 'restore', 'replace', 'import')),
	CONSTRAINT "change_events_revision_ck" CHECK("change_events"."entity_revision" is null or "change_events"."entity_revision" >= 1),
	CONSTRAINT "change_events_details_json_ck" CHECK(json_valid("change_events"."details_json"))
);
--> statement-breakpoint
CREATE INDEX `change_events_history_idx` ON `change_events` (`property_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `change_events_entity_idx` ON `change_events` (`property_id`,`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `change_events_request_uq` ON `change_events` (`property_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `change_events_property_id_id_uq` ON `change_events` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `circuit_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`circuit_id` text NOT NULL,
	`breaker_pole_id` text NOT NULL,
	`electrical_node_id` text,
	`leg_role` text DEFAULT 'line' NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`circuit_id`) REFERENCES `circuits`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`breaker_pole_id`) REFERENCES `breaker_poles`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`electrical_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "circuit_sources_role_ck" CHECK("circuit_sources"."leg_role" in ('line', 'phase', 'neutral', 'other', 'unknown'))
);
--> statement-breakpoint
CREATE INDEX `circuit_sources_circuit_idx` ON `circuit_sources` (`property_id`,`circuit_id`);--> statement-breakpoint
CREATE INDEX `circuit_sources_pole_idx` ON `circuit_sources` (`property_id`,`breaker_pole_id`);--> statement-breakpoint
CREATE INDEX `circuit_sources_node_idx` ON `circuit_sources` (`property_id`,`electrical_node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `circuit_sources_property_id_id_uq` ON `circuit_sources` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `circuit_sources_circuit_pole_uq` ON `circuit_sources` (`property_id`,`circuit_id`,`breaker_pole_id`);--> statement-breakpoint
CREATE TABLE `circuits` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`permanent_code` text NOT NULL,
	`name` text NOT NULL,
	`nominal_voltage` integer,
	`purpose` text,
	`notes` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "circuits_voltage_ck" CHECK("circuits"."nominal_voltage" is null or "circuits"."nominal_voltage" > 0),
	CONSTRAINT "circuits_lifecycle_ck" CHECK("circuits"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "circuits_revision_ck" CHECK("circuits"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `circuits_property_state_idx` ON `circuits` (`property_id`,`lifecycle_state`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `circuits_property_id_id_uq` ON `circuits` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `circuits_property_code_uq` ON `circuits` (`property_id`,`permanent_code`);--> statement-breakpoint
CREATE TABLE `conductor_ends` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`conductor_id` text NOT NULL,
	`designation` text NOT NULL,
	`electrical_node_id` text NOT NULL,
	`termination_method` text DEFAULT 'unknown' NOT NULL,
	`certainty` text DEFAULT 'unknown' NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`conductor_id`) REFERENCES `conductors`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`electrical_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "conductor_ends_designation_ck" CHECK("conductor_ends"."designation" in ('A', 'B')),
	CONSTRAINT "conductor_ends_termination_ck" CHECK("conductor_ends"."termination_method" in ('screw', 'clamp', 'backstab', 'wirenut', 'lever_connector', 'crimp', 'solder', 'lug', 'integral', 'open', 'unknown', 'custom')),
	CONSTRAINT "conductor_ends_certainty_ck" CHECK("conductor_ends"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting'))
);
--> statement-breakpoint
CREATE INDEX `conductor_ends_node_idx` ON `conductor_ends` (`property_id`,`electrical_node_id`,`conductor_id`);--> statement-breakpoint
CREATE INDEX `conductor_ends_conductor_idx` ON `conductor_ends` (`property_id`,`conductor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conductor_ends_property_id_id_uq` ON `conductor_ends` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conductor_ends_conductor_designation_uq` ON `conductor_ends` (`property_id`,`conductor_id`,`designation`);--> statement-breakpoint
CREATE TABLE `conductors` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`permanent_code` text NOT NULL,
	`cable_asset_id` text,
	`kind` text NOT NULL,
	`core_index` integer,
	`observed_insulation_color` text,
	`reidentification_marking` text,
	`gauge` text,
	`material` text,
	`observed_role` text,
	`assigned_role` text,
	`notes` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`cable_asset_id`) REFERENCES `cables`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "conductors_kind_ck" CHECK("conductors"."kind" in ('cable_core', 'cable_equipment_ground', 'pigtail', 'jumper', 'device_lead', 'standalone_raceway', 'unknown', 'custom')),
	CONSTRAINT "conductors_core_index_ck" CHECK("conductors"."core_index" is null or "conductors"."core_index" >= 1),
	CONSTRAINT "conductors_material_ck" CHECK("conductors"."material" is null or "conductors"."material" in ('copper', 'aluminum', 'copper_clad_aluminum', 'unknown', 'custom')),
	CONSTRAINT "conductors_observed_role_ck" CHECK("conductors"."observed_role" is null or "conductors"."observed_role" in ('line', 'load', 'switched_line', 'common', 'traveler_1', 'traveler_2', 'neutral', 'ground', 'aux', 'data', 'unknown', 'custom')),
	CONSTRAINT "conductors_assigned_role_ck" CHECK("conductors"."assigned_role" is null or "conductors"."assigned_role" in ('line', 'load', 'switched_line', 'common', 'traveler_1', 'traveler_2', 'neutral', 'ground', 'aux', 'data', 'unknown', 'custom')),
	CONSTRAINT "conductors_lifecycle_ck" CHECK("conductors"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "conductors_revision_ck" CHECK("conductors"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `conductors_cable_idx` ON `conductors` (`property_id`,`cable_asset_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `conductors_property_id_id_uq` ON `conductors` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conductors_property_code_uq` ON `conductors` (`property_id`,`permanent_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `conductors_cable_core_index_uq` ON `conductors` (`property_id`,`cable_asset_id`,`core_index`);--> statement-breakpoint
CREATE TABLE `control_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`permanent_code` text NOT NULL,
	`name` text NOT NULL,
	`presentation_label` text,
	`notes` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "control_groups_lifecycle_ck" CHECK("control_groups"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "control_groups_revision_ck" CHECK("control_groups"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `control_groups_property_id_id_uq` ON `control_groups` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_groups_property_code_uq` ON `control_groups` (`property_id`,`permanent_code`);--> statement-breakpoint
CREATE TABLE `control_links` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`control_group_id` text NOT NULL,
	`from_function_id` text NOT NULL,
	`to_function_id` text NOT NULL,
	`method` text NOT NULL,
	`certainty` text DEFAULT 'unknown' NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`control_group_id`) REFERENCES `control_groups`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`from_function_id`) REFERENCES `asset_functions`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`to_function_id`) REFERENCES `asset_functions`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "control_links_distinct_functions_ck" CHECK("control_links"."from_function_id" <> "control_links"."to_function_id"),
	CONSTRAINT "control_links_method_ck" CHECK("control_links"."method" in ('mechanical_traveler', 'wired_auxiliary_data', 'hardwired_relay', 'wireless_direct', 'hub_app', 'scene_automation', 'custom')),
	CONSTRAINT "control_links_certainty_ck" CHECK("control_links"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting'))
);
--> statement-breakpoint
CREATE INDEX `control_links_from_idx` ON `control_links` (`property_id`,`from_function_id`);--> statement-breakpoint
CREATE INDEX `control_links_to_idx` ON `control_links` (`property_id`,`to_function_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_links_property_id_id_uq` ON `control_links` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_links_edge_uq` ON `control_links` (`property_id`,`control_group_id`,`from_function_id`,`to_function_id`,`method`);--> statement-breakpoint
CREATE TABLE `control_members` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`control_group_id` text NOT NULL,
	`asset_function_id` text NOT NULL,
	`role` text NOT NULL,
	`method` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`control_group_id`) REFERENCES `control_groups`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`asset_function_id`) REFERENCES `asset_functions`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "control_members_role_ck" CHECK("control_members"."role" in ('controller', 'companion', 'controlled_load')),
	CONSTRAINT "control_members_method_ck" CHECK("control_members"."method" in ('mechanical_traveler', 'wired_auxiliary_data', 'hardwired_relay', 'wireless_direct', 'hub_app', 'scene_automation', 'custom'))
);
--> statement-breakpoint
CREATE INDEX `control_members_group_idx` ON `control_members` (`property_id`,`control_group_id`,`role`,`sort_order`);--> statement-breakpoint
CREATE INDEX `control_members_function_idx` ON `control_members` (`property_id`,`asset_function_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_members_property_id_id_uq` ON `control_members` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_members_group_function_role_uq` ON `control_members` (`property_id`,`control_group_id`,`asset_function_id`,`role`);--> statement-breakpoint
CREATE TABLE `devices` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`device_kind` text NOT NULL,
	`smart_state` text DEFAULT 'unknown' NOT NULL,
	`protocol` text,
	`configuration_label` text,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "devices_kind_ck" CHECK("devices"."device_kind" in ('switch', 'dimmer', 'relay', 'receptacle', 'gfci_receptacle', 'sensor', 'timer', 'scene_controller', 'smart_companion', 'wireless_controller', 'custom')),
	CONSTRAINT "devices_smart_state_ck" CHECK("devices"."smart_state" in ('smart', 'dumb', 'unknown', 'not_applicable'))
);
--> statement-breakpoint
CREATE INDEX `devices_property_kind_idx` ON `devices` (`property_id`,`device_kind`,`smart_state`);--> statement-breakpoint
CREATE UNIQUE INDEX `devices_property_asset_uq` ON `devices` (`property_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `diagram_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`box_asset_id` text NOT NULL,
	`anchor_type` text NOT NULL,
	`anchor_id` text,
	`x_normalized` real,
	`y_normalized` real,
	`text` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`property_id`,`box_asset_id`) REFERENCES `boxes`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "diagram_annotations_x_ck" CHECK("diagram_annotations"."x_normalized" is null or ("diagram_annotations"."x_normalized" >= 0 and "diagram_annotations"."x_normalized" <= 1)),
	CONSTRAINT "diagram_annotations_y_ck" CHECK("diagram_annotations"."y_normalized" is null or ("diagram_annotations"."y_normalized" >= 0 and "diagram_annotations"."y_normalized" <= 1))
);
--> statement-breakpoint
CREATE INDEX `diagram_annotations_box_idx` ON `diagram_annotations` (`property_id`,`box_asset_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `diagram_annotations_property_id_id_uq` ON `diagram_annotations` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `electrical_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`kind` text NOT NULL,
	`containing_box_asset_id` text,
	`containing_asset_id` text,
	`label` text,
	`certainty` text DEFAULT 'unknown' NOT NULL,
	`notes` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`containing_box_asset_id`) REFERENCES `boxes`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`containing_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "electrical_nodes_kind_ck" CHECK("electrical_nodes"."kind" in ('terminal', 'splice', 'open_endpoint', 'bond_point', 'source', 'custom')),
	CONSTRAINT "electrical_nodes_certainty_ck" CHECK("electrical_nodes"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "electrical_nodes_lifecycle_ck" CHECK("electrical_nodes"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "electrical_nodes_revision_ck" CHECK("electrical_nodes"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `electrical_nodes_box_idx` ON `electrical_nodes` (`property_id`,`containing_box_asset_id`,`kind`);--> statement-breakpoint
CREATE INDEX `electrical_nodes_asset_idx` ON `electrical_nodes` (`property_id`,`containing_asset_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `electrical_nodes_property_id_id_uq` ON `electrical_nodes` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`method` text NOT NULL,
	`knowledge_state` text DEFAULT 'unknown' NOT NULL,
	`confidence` real,
	`observed_at` text,
	`observer` text,
	`notes` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evidence_method_ck" CHECK("evidence"."method" in ('visual_inspection', 'breaker_test', 'continuity_test', 'voltage_test', 'documentation', 'photo', 'user_statement', 'inference', 'other')),
	CONSTRAINT "evidence_knowledge_ck" CHECK("evidence"."knowledge_state" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "evidence_confidence_ck" CHECK("evidence"."confidence" is null or ("evidence"."confidence" >= 0 and "evidence"."confidence" <= 1)),
	CONSTRAINT "evidence_revision_ck" CHECK("evidence"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `evidence_property_observed_idx` ON `evidence` (`property_id`,`observed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_property_id_id_uq` ON `evidence` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `evidence_links` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`relationship` text DEFAULT 'supports' NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`evidence_id`) REFERENCES `evidence`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `evidence_links_evidence_idx` ON `evidence_links` (`property_id`,`evidence_id`);--> statement-breakpoint
CREATE INDEX `evidence_links_target_idx` ON `evidence_links` (`property_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_links_property_id_id_uq` ON `evidence_links` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_links_target_uq` ON `evidence_links` (`property_id`,`evidence_id`,`target_type`,`target_id`,`relationship`);--> statement-breakpoint
CREATE TABLE `fixtures` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`fixture_kind` text NOT NULL,
	`smart_state` text DEFAULT 'unknown' NOT NULL,
	`integrated_light_source` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "fixtures_kind_ck" CHECK("fixtures"."fixture_kind" in ('light', 'fan', 'fan_light', 'integrated_led', 'other', 'custom')),
	CONSTRAINT "fixtures_smart_state_ck" CHECK("fixtures"."smart_state" in ('smart', 'dumb', 'unknown', 'not_applicable'))
);
--> statement-breakpoint
CREATE INDEX `fixtures_property_kind_idx` ON `fixtures` (`property_id`,`fixture_kind`,`smart_state`);--> statement-breakpoint
CREATE UNIQUE INDEX `fixtures_property_asset_uq` ON `fixtures` (`property_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `floor_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`level_id` text NOT NULL,
	`background_attachment_id` text,
	`name` text NOT NULL,
	`page_number` integer,
	`units_per_plan_unit` real,
	`calibration_unit` text,
	`orientation_degrees` real DEFAULT 0 NOT NULL,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`level_id`) REFERENCES `levels`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`background_attachment_id`) REFERENCES `attachments`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "floor_plans_calibration_unit_ck" CHECK("floor_plans"."calibration_unit" is null or "floor_plans"."calibration_unit" in ('in', 'ft', 'mm', 'cm', 'm')),
	CONSTRAINT "floor_plans_units_ck" CHECK("floor_plans"."units_per_plan_unit" is null or "floor_plans"."units_per_plan_unit" > 0),
	CONSTRAINT "floor_plans_page_ck" CHECK("floor_plans"."page_number" is null or "floor_plans"."page_number" >= 1),
	CONSTRAINT "floor_plans_lifecycle_ck" CHECK("floor_plans"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "floor_plans_revision_ck" CHECK("floor_plans"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `floor_plans_level_idx` ON `floor_plans` (`property_id`,`level_id`,`lifecycle_state`);--> statement-breakpoint
CREATE UNIQUE INDEX `floor_plans_property_id_id_uq` ON `floor_plans` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `installed_device_details` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`installed_product_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`normalized_value` text,
	`sensitivity` text DEFAULT 'identifier' NOT NULL,
	`notes` text,
	`verification_state` text DEFAULT 'unknown' NOT NULL,
	`verified_at` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`installed_product_id`) REFERENCES `installed_products`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "installed_device_details_kind_ck" CHECK("installed_device_details"."kind" in ('mac_address', 'zigbee_ieee', 'matter_device_id', 'manufacturer_device_id', 'setup_code', 'pairing_code', 'install_code', 'onboarding_payload', 'hub_bridge', 'ecosystem_name', 'custom')),
	CONSTRAINT "installed_device_details_sensitivity_ck" CHECK("installed_device_details"."sensitivity" in ('ordinary', 'identifier', 'secret')),
	CONSTRAINT "installed_device_details_secret_normalized_ck" CHECK("installed_device_details"."sensitivity" <> 'secret' or "installed_device_details"."normalized_value" is null),
	CONSTRAINT "installed_device_details_label_ck" CHECK(length(trim("installed_device_details"."label")) > 0),
	CONSTRAINT "installed_device_details_value_ck" CHECK(length("installed_device_details"."value") > 0),
	CONSTRAINT "installed_device_details_verification_ck" CHECK("installed_device_details"."verification_state" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "installed_device_details_lifecycle_ck" CHECK("installed_device_details"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "installed_device_details_revision_ck" CHECK("installed_device_details"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `installed_device_details_product_state_idx` ON `installed_device_details` (`property_id`,`installed_product_id`,`lifecycle_state`);--> statement-breakpoint
CREATE INDEX `installed_device_details_identifier_idx` ON `installed_device_details` (`property_id`,`sensitivity`,`normalized_value`);--> statement-breakpoint
CREATE UNIQUE INDEX `installed_device_details_property_id_id_uq` ON `installed_device_details` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `installed_products` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`product_model_id` text,
	`manufacturer` text,
	`model` text,
	`sku` text,
	`serial_number` text,
	`hardware_revision` text,
	`firmware_version` text,
	`smart_state` text DEFAULT 'unknown' NOT NULL,
	`capabilities_json` text DEFAULT '{}' NOT NULL,
	`installed_at` text,
	`removed_at` text,
	`notes` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`product_model_id`) REFERENCES `product_models`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "installed_products_smart_state_ck" CHECK("installed_products"."smart_state" in ('smart', 'dumb', 'unknown', 'not_applicable')),
	CONSTRAINT "installed_products_capabilities_json_ck" CHECK(json_valid("installed_products"."capabilities_json")),
	CONSTRAINT "installed_products_lifecycle_ck" CHECK("installed_products"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "installed_products_dates_ck" CHECK("installed_products"."removed_at" is null or "installed_products"."installed_at" is null or "installed_products"."removed_at" >= "installed_products"."installed_at"),
	CONSTRAINT "installed_products_revision_ck" CHECK("installed_products"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `installed_products_asset_state_idx` ON `installed_products` (`property_id`,`asset_id`,`lifecycle_state`);--> statement-breakpoint
CREATE UNIQUE INDEX `installed_products_property_id_id_uq` ON `installed_products` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `internal_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`owning_asset_id` text NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`connection_type` text NOT NULL,
	`contact_state_group` text,
	`contact_state` text,
	`directionality` text DEFAULT 'bidirectional' NOT NULL,
	`connection_state` text DEFAULT 'connected' NOT NULL,
	`certainty` text DEFAULT 'documentation_verified' NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`owning_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`from_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`to_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "internal_connections_distinct_nodes_ck" CHECK("internal_connections"."from_node_id" <> "internal_connections"."to_node_id"),
	CONSTRAINT "internal_connections_type_ck" CHECK("internal_connections"."connection_type" in ('always_connected', 'conditional_contact', 'breakable_tab', 'load_impedance', 'transformer_isolation', 'electronic_signal_only', 'ground_bond')),
	CONSTRAINT "internal_connections_direction_ck" CHECK("internal_connections"."directionality" in ('bidirectional', 'forward', 'reverse')),
	CONSTRAINT "internal_connections_state_ck" CHECK("internal_connections"."connection_state" in ('connected', 'disconnected', 'unknown')),
	CONSTRAINT "internal_connections_certainty_ck" CHECK("internal_connections"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "internal_connections_contact_state_ck" CHECK("internal_connections"."connection_type" <> 'conditional_contact' or ("internal_connections"."contact_state_group" is not null and "internal_connections"."contact_state" is not null))
);
--> statement-breakpoint
CREATE INDEX `internal_connections_from_idx` ON `internal_connections` (`property_id`,`from_node_id`);--> statement-breakpoint
CREATE INDEX `internal_connections_to_idx` ON `internal_connections` (`property_id`,`to_node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `internal_connections_property_id_id_uq` ON `internal_connections` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `internal_connections_edge_state_uq` ON `internal_connections` (`property_id`,`owning_asset_id`,`from_node_id`,`to_node_id`,`connection_type`,`contact_state_group`,`contact_state`);--> statement-breakpoint
CREATE TABLE `lamp_holders` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`fixture_asset_id` text NOT NULL,
	`asset_function_id` text,
	`position_key` text NOT NULL,
	`base_type` text,
	`lamp_shape` text,
	`max_watts` real,
	`notes` text,
	FOREIGN KEY (`property_id`,`fixture_asset_id`) REFERENCES `fixtures`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`fixture_asset_id`,`asset_function_id`) REFERENCES `asset_functions`(`property_id`,`asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "lamp_holders_max_watts_ck" CHECK("lamp_holders"."max_watts" is null or "lamp_holders"."max_watts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lamp_holders_property_id_id_uq` ON `lamp_holders` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lamp_holders_property_fixture_id_uq` ON `lamp_holders` (`property_id`,`fixture_asset_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lamp_holders_fixture_position_uq` ON `lamp_holders` (`property_id`,`fixture_asset_id`,`position_key`);--> statement-breakpoint
CREATE TABLE `levels` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`structure_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`elevation_order` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`structure_id`) REFERENCES `structures`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "levels_lifecycle_ck" CHECK("levels"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "levels_revision_ck" CHECK("levels"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `levels_structure_order_idx` ON `levels` (`property_id`,`structure_id`,`elevation_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `levels_property_id_id_uq` ON `levels` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `levels_property_structure_code_uq` ON `levels` (`property_id`,`structure_id`,`code`);--> statement-breakpoint
CREATE TABLE `light_sources` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`fixture_asset_id` text NOT NULL,
	`lamp_holder_id` text,
	`technology` text,
	`bulb_type` text,
	`base_type` text,
	`watts` real,
	`lumens` real,
	`color_temperature_kelvin` integer,
	`smart_state` text DEFAULT 'unknown' NOT NULL,
	`integrated` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`fixture_asset_id`) REFERENCES `fixtures`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`fixture_asset_id`,`lamp_holder_id`) REFERENCES `lamp_holders`(`property_id`,`fixture_asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "light_sources_smart_state_ck" CHECK("light_sources"."smart_state" in ('smart', 'dumb', 'unknown', 'not_applicable')),
	CONSTRAINT "light_sources_watts_ck" CHECK("light_sources"."watts" is null or "light_sources"."watts" >= 0),
	CONSTRAINT "light_sources_lumens_ck" CHECK("light_sources"."lumens" is null or "light_sources"."lumens" >= 0),
	CONSTRAINT "light_sources_kelvin_ck" CHECK("light_sources"."color_temperature_kelvin" is null or "light_sources"."color_temperature_kelvin" > 0)
);
--> statement-breakpoint
CREATE INDEX `light_sources_fixture_idx` ON `light_sources` (`property_id`,`fixture_asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `light_sources_property_asset_uq` ON `light_sources` (`property_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `open_endpoints` (
	`electrical_node_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`endpoint_kind` text DEFAULT 'unknown' NOT NULL,
	`description` text,
	FOREIGN KEY (`property_id`,`electrical_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "open_endpoints_kind_ck" CHECK("open_endpoints"."endpoint_kind" in ('capped', 'abandoned', 'unconnected', 'unknown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `open_endpoints_property_node_uq` ON `open_endpoints` (`property_id`,`electrical_node_id`);--> statement-breakpoint
CREATE TABLE `panel_feeders` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`upstream_circuit_id` text NOT NULL,
	`downstream_panel_asset_id` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`upstream_circuit_id`) REFERENCES `circuits`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`downstream_panel_asset_id`) REFERENCES `panels`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `panel_feeders_upstream_idx` ON `panel_feeders` (`property_id`,`upstream_circuit_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `panel_feeders_property_id_id_uq` ON `panel_feeders` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `panel_feeders_downstream_panel_uq` ON `panel_feeders` (`property_id`,`downstream_panel_asset_id`);--> statement-breakpoint
CREATE TABLE `panel_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`panel_asset_id` text NOT NULL,
	`slot_number` integer NOT NULL,
	`side` text DEFAULT 'single' NOT NULL,
	`column_label` text,
	`tandem_subposition` text DEFAULT 'full' NOT NULL,
	`label` text,
	FOREIGN KEY (`property_id`,`panel_asset_id`) REFERENCES `panels`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "panel_positions_slot_ck" CHECK("panel_positions"."slot_number" >= 1),
	CONSTRAINT "panel_positions_side_ck" CHECK("panel_positions"."side" in ('left', 'right', 'single', 'custom'))
);
--> statement-breakpoint
CREATE INDEX `panel_positions_panel_slot_idx` ON `panel_positions` (`property_id`,`panel_asset_id`,`slot_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `panel_positions_property_id_id_uq` ON `panel_positions` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `panel_positions_property_panel_id_uq` ON `panel_positions` (`property_id`,`panel_asset_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `panel_positions_slot_uq` ON `panel_positions` (`property_id`,`panel_asset_id`,`slot_number`,`side`,`tandem_subposition`);--> statement-breakpoint
CREATE TABLE `panels` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`role` text DEFAULT 'unknown' NOT NULL,
	`nominal_voltage` integer,
	`phase_count` integer,
	`max_amps` integer,
	`system_notes` text,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "panels_role_ck" CHECK("panels"."role" in ('main', 'subpanel', 'distribution', 'disconnect', 'other', 'unknown')),
	CONSTRAINT "panels_voltage_ck" CHECK("panels"."nominal_voltage" is null or "panels"."nominal_voltage" > 0),
	CONSTRAINT "panels_phase_count_ck" CHECK("panels"."phase_count" is null or "panels"."phase_count" > 0),
	CONSTRAINT "panels_max_amps_ck" CHECK("panels"."max_amps" is null or "panels"."max_amps" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `panels_property_asset_uq` ON `panels` (`property_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `plan_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`floor_plan_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`x_normalized` real NOT NULL,
	`y_normalized` real NOT NULL,
	`rotation_degrees` real DEFAULT 0 NOT NULL,
	`wall_offset` real,
	`height` real,
	`height_unit` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`floor_plan_id`) REFERENCES `floor_plans`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "plan_placements_x_ck" CHECK("plan_placements"."x_normalized" >= 0 and "plan_placements"."x_normalized" <= 1),
	CONSTRAINT "plan_placements_y_ck" CHECK("plan_placements"."y_normalized" >= 0 and "plan_placements"."y_normalized" <= 1),
	CONSTRAINT "plan_placements_wall_offset_ck" CHECK("plan_placements"."wall_offset" is null or ("plan_placements"."wall_offset" >= 0 and "plan_placements"."wall_offset" <= 1)),
	CONSTRAINT "plan_placements_height_unit_ck" CHECK("plan_placements"."height_unit" is null or "plan_placements"."height_unit" in ('in', 'ft', 'mm', 'cm', 'm')),
	CONSTRAINT "plan_placements_revision_ck" CHECK("plan_placements"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `plan_placements_plan_idx` ON `plan_placements` (`property_id`,`floor_plan_id`);--> statement-breakpoint
CREATE INDEX `plan_placements_asset_idx` ON `plan_placements` (`property_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_placements_property_id_id_uq` ON `plan_placements` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_placements_plan_asset_uq` ON `plan_placements` (`property_id`,`floor_plan_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `plug_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`appliance_asset_id` text NOT NULL,
	`receptacle_function_id` text NOT NULL,
	`connected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`disconnected_at` text,
	`notes` text,
	FOREIGN KEY (`property_id`,`appliance_asset_id`) REFERENCES `appliances`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`receptacle_function_id`) REFERENCES `asset_functions`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "plug_connections_dates_ck" CHECK("plug_connections"."disconnected_at" is null or "plug_connections"."disconnected_at" >= "plug_connections"."connected_at")
);
--> statement-breakpoint
CREATE INDEX `plug_connections_appliance_idx` ON `plug_connections` (`property_id`,`appliance_asset_id`,`disconnected_at`);--> statement-breakpoint
CREATE INDEX `plug_connections_receptacle_idx` ON `plug_connections` (`property_id`,`receptacle_function_id`,`disconnected_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `plug_connections_property_id_id_uq` ON `plug_connections` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `product_models` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`manufacturer` text,
	`model` text NOT NULL,
	`category` text NOT NULL,
	`sku` text,
	`smart_state` text DEFAULT 'unknown' NOT NULL,
	`protocols_json` text DEFAULT '[]' NOT NULL,
	`capabilities_json` text DEFAULT '{}' NOT NULL,
	`requirements_json` text DEFAULT '{}' NOT NULL,
	`notes` text,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "product_models_smart_state_ck" CHECK("product_models"."smart_state" in ('smart', 'dumb', 'unknown', 'not_applicable')),
	CONSTRAINT "product_models_protocols_json_ck" CHECK(json_valid("product_models"."protocols_json")),
	CONSTRAINT "product_models_capabilities_json_ck" CHECK(json_valid("product_models"."capabilities_json")),
	CONSTRAINT "product_models_requirements_json_ck" CHECK(json_valid("product_models"."requirements_json")),
	CONSTRAINT "product_models_lifecycle_ck" CHECK("product_models"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "product_models_revision_ck" CHECK("product_models"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `product_models_property_category_idx` ON `product_models` (`property_id`,`category`,`manufacturer`,`model`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_models_property_id_id_uq` ON `product_models` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`permanent_code` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`preferences_json` text DEFAULT '{}' NOT NULL,
	`naming_config_json` text DEFAULT '{}' NOT NULL,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "properties_lifecycle_ck" CHECK("properties"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "properties_preferences_json_ck" CHECK(json_valid("properties"."preferences_json")),
	CONSTRAINT "properties_naming_config_json_ck" CHECK(json_valid("properties"."naming_config_json")),
	CONSTRAINT "properties_revision_ck" CHECK("properties"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `properties_workspace_state_idx` ON `properties` (`workspace_id`,`lifecycle_state`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `properties_workspace_id_id_uq` ON `properties` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `properties_workspace_code_uq` ON `properties` (`workspace_id`,`permanent_code`);--> statement-breakpoint
CREATE TABLE `property_code_counters` (
	`property_id` text NOT NULL,
	`code_prefix` text NOT NULL,
	`next_value` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`property_id`, `code_prefix`),
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "property_code_counters_next_value_ck" CHECK("property_code_counters"."next_value" >= 1)
);
--> statement-breakpoint
CREATE TABLE `property_revisions` (
	`property_id` text PRIMARY KEY NOT NULL,
	`data_revision` integer DEFAULT 0 NOT NULL,
	`topology_revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "property_revisions_data_ck" CHECK("property_revisions"."data_revision" >= 0),
	CONSTRAINT "property_revisions_topology_ck" CHECK("property_revisions"."topology_revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE `proposed_products` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`upgrade_item_id` text NOT NULL,
	`product_model_id` text,
	`manufacturer` text,
	`model` text,
	`product_url` text,
	`estimated_cost` real,
	`currency` text,
	`rank` integer DEFAULT 0 NOT NULL,
	`selected` integer DEFAULT false NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`upgrade_item_id`) REFERENCES `upgrade_items`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`product_model_id`) REFERENCES `product_models`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "proposed_products_cost_ck" CHECK("proposed_products"."estimated_cost" is null or "proposed_products"."estimated_cost" >= 0),
	CONSTRAINT "proposed_products_rank_ck" CHECK("proposed_products"."rank" >= 0)
);
--> statement-breakpoint
CREATE INDEX `proposed_products_item_idx` ON `proposed_products` (`property_id`,`upgrade_item_id`,`rank`);--> statement-breakpoint
CREATE UNIQUE INDEX `proposed_products_property_id_id_uq` ON `proposed_products` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `shared_neutral_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`certainty` text DEFAULT 'unknown' NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "shared_neutral_groups_certainty_ck" CHECK("shared_neutral_groups"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_neutral_groups_property_id_id_uq` ON `shared_neutral_groups` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `shared_neutral_members` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`shared_neutral_group_id` text NOT NULL,
	`circuit_id` text,
	`conductor_id` text,
	`member_role` text DEFAULT 'member' NOT NULL,
	FOREIGN KEY (`property_id`,`shared_neutral_group_id`) REFERENCES `shared_neutral_groups`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`circuit_id`) REFERENCES `circuits`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`conductor_id`) REFERENCES `conductors`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "shared_neutral_members_target_ck" CHECK(("shared_neutral_members"."circuit_id" is not null and "shared_neutral_members"."conductor_id" is null) or ("shared_neutral_members"."circuit_id" is null and "shared_neutral_members"."conductor_id" is not null))
);
--> statement-breakpoint
CREATE INDEX `shared_neutral_members_group_idx` ON `shared_neutral_members` (`property_id`,`shared_neutral_group_id`);--> statement-breakpoint
CREATE INDEX `shared_neutral_members_circuit_idx` ON `shared_neutral_members` (`property_id`,`circuit_id`);--> statement-breakpoint
CREATE INDEX `shared_neutral_members_conductor_idx` ON `shared_neutral_members` (`property_id`,`conductor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shared_neutral_members_property_id_id_uq` ON `shared_neutral_members` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`level_id` text NOT NULL,
	`parent_space_id` text,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'room' NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`level_id`) REFERENCES `levels`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`parent_space_id`) REFERENCES `spaces`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "spaces_lifecycle_ck" CHECK("spaces"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "spaces_revision_ck" CHECK("spaces"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `spaces_level_sort_idx` ON `spaces` (`property_id`,`level_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_property_id_id_uq` ON `spaces` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_property_level_code_uq` ON `spaces` (`property_id`,`level_id`,`code`);--> statement-breakpoint
CREATE TABLE `splices` (
	`electrical_node_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`box_asset_id` text NOT NULL,
	`connector_type` text,
	`label` text,
	FOREIGN KEY (`property_id`,`electrical_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`box_asset_id`) REFERENCES `boxes`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `splices_box_idx` ON `splices` (`property_id`,`box_asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `splices_property_node_uq` ON `splices` (`property_id`,`electrical_node_id`);--> statement-breakpoint
CREATE TABLE `structures` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'building' NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "structures_lifecycle_ck" CHECK("structures"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "structures_revision_ck" CHECK("structures"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `structures_property_sort_idx` ON `structures` (`property_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `structures_property_id_id_uq` ON `structures` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `structures_property_code_uq` ON `structures` (`property_id`,`code`);--> statement-breakpoint
CREATE TABLE `terminals` (
	`electrical_node_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`owning_asset_id` text NOT NULL,
	`asset_function_id` text,
	`terminal_key` text NOT NULL,
	`manufacturer_label` text,
	`semantic_role` text DEFAULT 'UNKNOWN' NOT NULL,
	`terminal_group` text,
	`notes` text,
	FOREIGN KEY (`property_id`,`electrical_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`owning_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`owning_asset_id`,`asset_function_id`) REFERENCES `asset_functions`(`property_id`,`asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "terminals_semantic_role_ck" CHECK("terminals"."semantic_role" in ('LINE', 'LOAD', 'COMMON', 'TRAVELER_1', 'TRAVELER_2', 'NEUTRAL', 'GROUND', 'AUX', 'MANUFACTURER_SPECIFIC', 'UNKNOWN'))
);
--> statement-breakpoint
CREATE INDEX `terminals_asset_idx` ON `terminals` (`property_id`,`owning_asset_id`,`asset_function_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `terminals_property_node_uq` ON `terminals` (`property_id`,`electrical_node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `terminals_asset_key_uq` ON `terminals` (`property_id`,`owning_asset_id`,`terminal_key`);--> statement-breakpoint
CREATE TABLE `trace_gaps` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`from_node_id` text,
	`to_node_id` text,
	`from_asset_id` text,
	`to_asset_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`certainty` text DEFAULT 'unknown' NOT NULL,
	`description` text NOT NULL,
	`resolved_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`from_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`to_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`from_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`to_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "trace_gaps_status_ck" CHECK("trace_gaps"."status" in ('open', 'resolved', 'accepted_unknown')),
	CONSTRAINT "trace_gaps_certainty_ck" CHECK("trace_gaps"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "trace_gaps_endpoints_ck" CHECK("trace_gaps"."from_node_id" is not null or "trace_gaps"."to_node_id" is not null or "trace_gaps"."from_asset_id" is not null or "trace_gaps"."to_asset_id" is not null),
	CONSTRAINT "trace_gaps_resolution_ck" CHECK("trace_gaps"."status" = 'open' or "trace_gaps"."resolved_at" is not null),
	CONSTRAINT "trace_gaps_revision_ck" CHECK("trace_gaps"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `trace_gaps_status_idx` ON `trace_gaps` (`property_id`,`status`);--> statement-breakpoint
CREATE INDEX `trace_gaps_from_node_idx` ON `trace_gaps` (`property_id`,`from_node_id`);--> statement-breakpoint
CREATE INDEX `trace_gaps_to_node_idx` ON `trace_gaps` (`property_id`,`to_node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `trace_gaps_property_id_id_uq` ON `trace_gaps` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `upgrade_items` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`permanent_code` text NOT NULL,
	`target_asset_id` text NOT NULL,
	`target_function_id` text,
	`target_box_asset_id` text,
	`status` text DEFAULT 'investigate' NOT NULL,
	`goal` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`completed_installed_product_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`target_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`target_asset_id`,`target_function_id`) REFERENCES `asset_functions`(`property_id`,`asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`target_box_asset_id`) REFERENCES `boxes`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`completed_installed_product_id`) REFERENCES `installed_products`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "upgrade_items_status_ck" CHECK("upgrade_items"."status" in ('keep', 'investigate', 'candidate', 'planned', 'purchased', 'installed', 'verified')),
	CONSTRAINT "upgrade_items_priority_ck" CHECK("upgrade_items"."priority" >= 0),
	CONSTRAINT "upgrade_items_revision_ck" CHECK("upgrade_items"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `upgrade_items_status_idx` ON `upgrade_items` (`property_id`,`status`,`priority`);--> statement-breakpoint
CREATE INDEX `upgrade_items_asset_idx` ON `upgrade_items` (`property_id`,`target_asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `upgrade_items_property_id_id_uq` ON `upgrade_items` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `upgrade_items_property_code_uq` ON `upgrade_items` (`property_id`,`permanent_code`);--> statement-breakpoint
CREATE TABLE `upgrade_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`upgrade_requirement_id` text NOT NULL,
	`readiness_state` text DEFAULT 'unknown' NOT NULL,
	`observed_value_json` text DEFAULT 'null' NOT NULL,
	`certainty` text DEFAULT 'unknown' NOT NULL,
	`evidence_id` text,
	`notes` text,
	`observed_at` text,
	FOREIGN KEY (`property_id`,`upgrade_requirement_id`) REFERENCES `upgrade_requirements`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`evidence_id`) REFERENCES `evidence`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "upgrade_observations_readiness_ck" CHECK("upgrade_observations"."readiness_state" in ('known', 'missing', 'conflicting', 'unknown')),
	CONSTRAINT "upgrade_observations_value_json_ck" CHECK(json_valid("upgrade_observations"."observed_value_json")),
	CONSTRAINT "upgrade_observations_certainty_ck" CHECK("upgrade_observations"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting'))
);
--> statement-breakpoint
CREATE INDEX `upgrade_observations_requirement_idx` ON `upgrade_observations` (`property_id`,`upgrade_requirement_id`,`observed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `upgrade_observations_property_id_id_uq` ON `upgrade_observations` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `upgrade_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`upgrade_item_id` text NOT NULL,
	`requirement_kind` text NOT NULL,
	`custom_requirement` text,
	`expected_value_json` text DEFAULT 'null' NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`property_id`,`upgrade_item_id`) REFERENCES `upgrade_items`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "upgrade_requirements_kind_ck" CHECK("upgrade_requirements"."requirement_kind" in ('neutral', 'ground', 'line_load_identity', 'box_capacity', 'multi_way_role', 'load_compatibility', 'protocol', 'hub', 'custom')),
	CONSTRAINT "upgrade_requirements_custom_ck" CHECK("upgrade_requirements"."requirement_kind" <> 'custom' or length(trim("upgrade_requirements"."custom_requirement")) > 0),
	CONSTRAINT "upgrade_requirements_value_json_ck" CHECK(json_valid("upgrade_requirements"."expected_value_json"))
);
--> statement-breakpoint
CREATE INDEX `upgrade_requirements_item_idx` ON `upgrade_requirements` (`property_id`,`upgrade_item_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `upgrade_requirements_property_id_id_uq` ON `upgrade_requirements` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `wall_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`space_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`orientation` text,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`space_id`) REFERENCES `spaces`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "wall_zones_lifecycle_ck" CHECK("wall_zones"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "wall_zones_revision_ck" CHECK("wall_zones"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `wall_zones_space_sort_idx` ON `wall_zones` (`property_id`,`space_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `wall_zones_property_id_id_uq` ON `wall_zones` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wall_zones_property_space_code_uq` ON `wall_zones` (`property_id`,`space_id`,`code`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_subject` text NOT NULL,
	`display_name` text,
	`preferences_json` text DEFAULT '{}' NOT NULL,
	`lifecycle_state` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "workspaces_lifecycle_ck" CHECK("workspaces"."lifecycle_state" in ('active', 'archived', 'removed', 'planned')),
	CONSTRAINT "workspaces_preferences_json_ck" CHECK(json_valid("workspaces"."preferences_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_owner_subject_uq` ON `workspaces` (`owner_subject`);