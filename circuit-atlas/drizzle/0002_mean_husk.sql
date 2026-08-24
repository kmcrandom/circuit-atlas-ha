CREATE TABLE `wiring_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_configuration_id` text,
	`supersedes_configuration_id` text,
	`summary` text,
	`verification_state` text DEFAULT 'unknown' NOT NULL,
	`captured_at` text,
	`effective_at` text,
	`finalized_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_configuration_id`) REFERENCES `wiring_configurations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supersedes_configuration_id`) REFERENCES `wiring_configurations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`source_configuration_id`) REFERENCES `wiring_configurations`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`supersedes_configuration_id`) REFERENCES `wiring_configurations`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "wiring_configurations_status_ck" CHECK("wiring_configurations"."status" in ('draft', 'planned', 'current', 'historical')),
	CONSTRAINT "wiring_configurations_verification_ck" CHECK("wiring_configurations"."verification_state" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "wiring_configurations_revision_ck" CHECK("wiring_configurations"."revision" >= 1),
	CONSTRAINT "wiring_configurations_finalized_ck" CHECK("wiring_configurations"."status" <> 'historical' or "wiring_configurations"."finalized_at" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wiring_configurations_one_current_uq` ON `wiring_configurations` (`property_id`) WHERE "wiring_configurations"."status" = 'current';--> statement-breakpoint
CREATE INDEX `wiring_configurations_property_status_idx` ON `wiring_configurations` (`property_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `wiring_configurations_property_id_id_uq` ON `wiring_configurations` (`property_id`,`id`);--> statement-breakpoint
INSERT INTO `wiring_configurations` (`id`, `property_id`, `name`, `status`, `verification_state`, `effective_at`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), `id`, 'Current wiring', 'current', 'unknown', CURRENT_TIMESTAMP FROM `properties`;--> statement-breakpoint
CREATE TABLE `conductor_end_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`wiring_configuration_id` text NOT NULL,
	`conductor_end_id` text NOT NULL,
	`electrical_node_id` text,
	`termination_method` text DEFAULT 'unknown' NOT NULL,
	`certainty` text DEFAULT 'unknown' NOT NULL,
	`conductor_role` text DEFAULT 'unknown' NOT NULL,
	`connection_state` text DEFAULT 'connected' NOT NULL,
	`notes` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`property_id`,`wiring_configuration_id`) REFERENCES `wiring_configurations`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`conductor_end_id`) REFERENCES `conductor_ends`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`electrical_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "conductor_end_connections_termination_ck" CHECK("conductor_end_connections"."termination_method" in ('screw', 'clamp', 'backstab', 'wirenut', 'lever_connector', 'crimp', 'solder', 'lug', 'integral', 'open', 'unknown', 'custom')),
	CONSTRAINT "conductor_end_connections_certainty_ck" CHECK("conductor_end_connections"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "conductor_end_connections_role_ck" CHECK("conductor_end_connections"."conductor_role" in ('line', 'load', 'switched_line', 'common', 'traveler_1', 'traveler_2', 'neutral', 'ground', 'aux', 'data', 'unknown', 'custom')),
	CONSTRAINT "conductor_end_connections_state_ck" CHECK("conductor_end_connections"."connection_state" in ('connected', 'capped', 'spare', 'abandoned', 'repurposed', 'unknown')),
	CONSTRAINT "conductor_end_connections_node_state_ck" CHECK(("conductor_end_connections"."connection_state" = 'connected' and "conductor_end_connections"."electrical_node_id" is not null) or ("conductor_end_connections"."connection_state" <> 'connected')),
	CONSTRAINT "conductor_end_connections_revision_ck" CHECK("conductor_end_connections"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `conductor_end_connections_node_idx` ON `conductor_end_connections` (`property_id`,`wiring_configuration_id`,`electrical_node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conductor_end_connections_property_id_id_uq` ON `conductor_end_connections` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conductor_end_connections_configuration_end_uq` ON `conductor_end_connections` (`property_id`,`wiring_configuration_id`,`conductor_end_id`);--> statement-breakpoint
INSERT INTO `conductor_end_connections` (`id`, `property_id`, `wiring_configuration_id`, `conductor_end_id`, `electrical_node_id`, `termination_method`, `certainty`, `conductor_role`, `connection_state`, `notes`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), ce.`property_id`, wc.`id`, ce.`id`, ce.`electrical_node_id`, ce.`termination_method`, ce.`certainty`, coalesce(c.`assigned_role`, 'unknown'), 'connected', ce.`notes`
FROM `conductor_ends` ce
JOIN `wiring_configurations` wc ON wc.`property_id` = ce.`property_id` AND wc.`status` = 'current'
JOIN `conductors` c ON c.`property_id` = ce.`property_id` AND c.`id` = ce.`conductor_id`;--> statement-breakpoint
CREATE TABLE `wiring_configuration_nodes` (
	`property_id` text NOT NULL,
	`wiring_configuration_id` text NOT NULL,
	`electrical_node_id` text NOT NULL,
	PRIMARY KEY(`property_id`, `wiring_configuration_id`, `electrical_node_id`),
	FOREIGN KEY (`property_id`,`wiring_configuration_id`) REFERENCES `wiring_configurations`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`electrical_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `wiring_configuration_nodes_node_idx` ON `wiring_configuration_nodes` (`property_id`,`electrical_node_id`,`wiring_configuration_id`);--> statement-breakpoint
INSERT INTO `wiring_configuration_nodes` (`property_id`, `wiring_configuration_id`, `electrical_node_id`)
SELECT DISTINCT ce.`property_id`, wc.`id`, ce.`electrical_node_id` FROM `conductor_ends` ce JOIN `wiring_configurations` wc ON wc.`property_id` = ce.`property_id` AND wc.`status` = 'current';--> statement-breakpoint
CREATE TABLE `wiring_configuration_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`wiring_configuration_id` text NOT NULL,
	`scope_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`wiring_configuration_id`) REFERENCES `wiring_configurations`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "wiring_configuration_scopes_kind_ck" CHECK("wiring_configuration_scopes"."scope_kind" in ('circuit', 'control_group', 'box', 'asset'))
);
--> statement-breakpoint
CREATE INDEX `wiring_configuration_scopes_configuration_idx` ON `wiring_configuration_scopes` (`property_id`,`wiring_configuration_id`,`scope_kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `wiring_configuration_scopes_property_id_id_uq` ON `wiring_configuration_scopes` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wiring_configuration_scopes_target_uq` ON `wiring_configuration_scopes` (`property_id`,`wiring_configuration_id`,`scope_kind`,`target_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_asset_circuit_assertions` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`wiring_configuration_id` text NOT NULL,
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
	FOREIGN KEY (`property_id`,`wiring_configuration_id`) REFERENCES `wiring_configurations`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`asset_id`,`asset_function_id`) REFERENCES `asset_functions`(`property_id`,`asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`circuit_id`) REFERENCES `circuits`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`evidence_id`) REFERENCES `evidence`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "asset_circuit_assertions_status_ck" CHECK("__new_asset_circuit_assertions"."status" in ('active', 'superseded', 'rejected', 'conflicting')),
	CONSTRAINT "asset_circuit_assertions_certainty_ck" CHECK("__new_asset_circuit_assertions"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "asset_circuit_assertions_revision_ck" CHECK("__new_asset_circuit_assertions"."revision" >= 1)
);
--> statement-breakpoint
INSERT INTO `__new_asset_circuit_assertions`("id", "property_id", "wiring_configuration_id", "asset_id", "asset_function_id", "circuit_id", "status", "certainty", "evidence_id", "notes", "revision", "created_at", "updated_at") SELECT a."id", a."property_id", wc."id", a."asset_id", a."asset_function_id", a."circuit_id", a."status", a."certainty", a."evidence_id", a."notes", a."revision", a."created_at", a."updated_at" FROM `asset_circuit_assertions` a JOIN `wiring_configurations` wc ON wc."property_id" = a."property_id" AND wc."status" = 'current';--> statement-breakpoint
DROP TABLE `asset_circuit_assertions`;--> statement-breakpoint
ALTER TABLE `__new_asset_circuit_assertions` RENAME TO `asset_circuit_assertions`;--> statement-breakpoint
CREATE INDEX `asset_circuit_assertions_asset_idx` ON `asset_circuit_assertions` (`property_id`,`wiring_configuration_id`,`asset_id`,`status`);--> statement-breakpoint
CREATE INDEX `asset_circuit_assertions_circuit_idx` ON `asset_circuit_assertions` (`property_id`,`wiring_configuration_id`,`circuit_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_circuit_assertions_property_id_id_uq` ON `asset_circuit_assertions` (`property_id`,`id`);--> statement-breakpoint
CREATE TABLE `__new_asset_mounts` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`wiring_configuration_id` text NOT NULL,
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
	FOREIGN KEY (`property_id`,`wiring_configuration_id`) REFERENCES `wiring_configurations`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`box_asset_id`) REFERENCES `boxes`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`mounted_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "asset_mounts_start_gang_ck" CHECK("__new_asset_mounts"."start_gang_index" >= 1),
	CONSTRAINT "asset_mounts_gang_span_ck" CHECK("__new_asset_mounts"."gang_span" >= 1),
	CONSTRAINT "asset_mounts_vertical_ck" CHECK("__new_asset_mounts"."vertical_position" >= 0 and "__new_asset_mounts"."vertical_position" <= 1),
	CONSTRAINT "asset_mounts_revision_ck" CHECK("__new_asset_mounts"."revision" >= 1)
);
--> statement-breakpoint
INSERT INTO `__new_asset_mounts`("id", "property_id", "wiring_configuration_id", "box_asset_id", "mounted_asset_id", "start_gang_index", "gang_span", "vertical_position", "rotation_degrees", "face_label", "revision", "created_at", "updated_at") SELECT am."id", am."property_id", wc."id", am."box_asset_id", am."mounted_asset_id", am."start_gang_index", am."gang_span", am."vertical_position", am."rotation_degrees", am."face_label", am."revision", am."created_at", am."updated_at" FROM `asset_mounts` am JOIN `wiring_configurations` wc ON wc."property_id" = am."property_id" AND wc."status" = 'current';--> statement-breakpoint
DROP TABLE `asset_mounts`;--> statement-breakpoint
ALTER TABLE `__new_asset_mounts` RENAME TO `asset_mounts`;--> statement-breakpoint
CREATE INDEX `asset_mounts_box_idx` ON `asset_mounts` (`property_id`,`wiring_configuration_id`,`box_asset_id`,`start_gang_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_mounts_property_id_id_uq` ON `asset_mounts` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_mounts_property_box_id_uq` ON `asset_mounts` (`property_id`,`box_asset_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_mounts_property_configuration_box_id_uq` ON `asset_mounts` (`property_id`,`wiring_configuration_id`,`box_asset_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_mounts_asset_uq` ON `asset_mounts` (`property_id`,`wiring_configuration_id`,`mounted_asset_id`);--> statement-breakpoint
CREATE TABLE `__new_asset_mount_positions` (
	`property_id` text NOT NULL,
	`wiring_configuration_id` text NOT NULL,
	`mount_id` text NOT NULL,
	`box_asset_id` text NOT NULL,
	`gang_index` integer NOT NULL,
	PRIMARY KEY(`property_id`, `wiring_configuration_id`, `mount_id`, `gang_index`),
	FOREIGN KEY (`property_id`,`wiring_configuration_id`) REFERENCES `wiring_configurations`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`wiring_configuration_id`,`box_asset_id`,`mount_id`) REFERENCES `asset_mounts`(`property_id`,`wiring_configuration_id`,`box_asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "asset_mount_positions_gang_ck" CHECK("__new_asset_mount_positions"."gang_index" >= 1)
);
--> statement-breakpoint
INSERT INTO `__new_asset_mount_positions`("property_id", "wiring_configuration_id", "mount_id", "box_asset_id", "gang_index") SELECT amp."property_id", wc."id", amp."mount_id", amp."box_asset_id", amp."gang_index" FROM `asset_mount_positions` amp JOIN `wiring_configurations` wc ON wc."property_id" = amp."property_id" AND wc."status" = 'current';--> statement-breakpoint
DROP TABLE `asset_mount_positions`;--> statement-breakpoint
ALTER TABLE `__new_asset_mount_positions` RENAME TO `asset_mount_positions`;--> statement-breakpoint
CREATE UNIQUE INDEX `asset_mount_positions_box_gang_uq` ON `asset_mount_positions` (`property_id`,`wiring_configuration_id`,`box_asset_id`,`gang_index`);--> statement-breakpoint
CREATE TABLE `__new_control_links` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`wiring_configuration_id` text NOT NULL,
	`control_group_id` text NOT NULL,
	`from_function_id` text NOT NULL,
	`to_function_id` text NOT NULL,
	`method` text NOT NULL,
	`certainty` text DEFAULT 'unknown' NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`wiring_configuration_id`) REFERENCES `wiring_configurations`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`control_group_id`) REFERENCES `control_groups`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`from_function_id`) REFERENCES `asset_functions`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`to_function_id`) REFERENCES `asset_functions`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "control_links_distinct_functions_ck" CHECK("__new_control_links"."from_function_id" <> "__new_control_links"."to_function_id"),
	CONSTRAINT "control_links_method_ck" CHECK("__new_control_links"."method" in ('mechanical_traveler', 'wired_auxiliary_data', 'hardwired_relay', 'wireless_direct', 'hub_app', 'scene_automation', 'custom')),
	CONSTRAINT "control_links_certainty_ck" CHECK("__new_control_links"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting'))
);
--> statement-breakpoint
INSERT INTO `__new_control_links`("id", "property_id", "wiring_configuration_id", "control_group_id", "from_function_id", "to_function_id", "method", "certainty", "notes") SELECT cl."id", cl."property_id", wc."id", cl."control_group_id", cl."from_function_id", cl."to_function_id", cl."method", cl."certainty", cl."notes" FROM `control_links` cl JOIN `wiring_configurations` wc ON wc."property_id" = cl."property_id" AND wc."status" = 'current';--> statement-breakpoint
DROP TABLE `control_links`;--> statement-breakpoint
ALTER TABLE `__new_control_links` RENAME TO `control_links`;--> statement-breakpoint
CREATE INDEX `control_links_from_idx` ON `control_links` (`property_id`,`wiring_configuration_id`,`from_function_id`);--> statement-breakpoint
CREATE INDEX `control_links_to_idx` ON `control_links` (`property_id`,`wiring_configuration_id`,`to_function_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_links_property_id_id_uq` ON `control_links` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_links_edge_uq` ON `control_links` (`property_id`,`wiring_configuration_id`,`control_group_id`,`from_function_id`,`to_function_id`,`method`);--> statement-breakpoint
CREATE TABLE `__new_control_members` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`wiring_configuration_id` text NOT NULL,
	`control_group_id` text NOT NULL,
	`asset_function_id` text NOT NULL,
	`role` text NOT NULL,
	`method` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`,`wiring_configuration_id`) REFERENCES `wiring_configurations`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`control_group_id`) REFERENCES `control_groups`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`asset_function_id`) REFERENCES `asset_functions`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "control_members_role_ck" CHECK("__new_control_members"."role" in ('controller', 'companion', 'controlled_load')),
	CONSTRAINT "control_members_method_ck" CHECK("__new_control_members"."method" in ('mechanical_traveler', 'wired_auxiliary_data', 'hardwired_relay', 'wireless_direct', 'hub_app', 'scene_automation', 'custom'))
);
--> statement-breakpoint
INSERT INTO `__new_control_members`("id", "property_id", "wiring_configuration_id", "control_group_id", "asset_function_id", "role", "method", "sort_order", "notes") SELECT cm."id", cm."property_id", wc."id", cm."control_group_id", cm."asset_function_id", cm."role", cm."method", cm."sort_order", cm."notes" FROM `control_members` cm JOIN `wiring_configurations` wc ON wc."property_id" = cm."property_id" AND wc."status" = 'current';--> statement-breakpoint
DROP TABLE `control_members`;--> statement-breakpoint
ALTER TABLE `__new_control_members` RENAME TO `control_members`;--> statement-breakpoint
CREATE INDEX `control_members_group_idx` ON `control_members` (`property_id`,`wiring_configuration_id`,`control_group_id`,`role`,`sort_order`);--> statement-breakpoint
CREATE INDEX `control_members_function_idx` ON `control_members` (`property_id`,`wiring_configuration_id`,`asset_function_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_members_property_id_id_uq` ON `control_members` (`property_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_members_group_function_role_uq` ON `control_members` (`property_id`,`wiring_configuration_id`,`control_group_id`,`asset_function_id`,`role`);--> statement-breakpoint
CREATE TABLE `__new_trace_gaps` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`wiring_configuration_id` text NOT NULL,
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
	FOREIGN KEY (`property_id`,`wiring_configuration_id`) REFERENCES `wiring_configurations`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`from_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`to_node_id`) REFERENCES `electrical_nodes`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`from_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`to_asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "trace_gaps_status_ck" CHECK("__new_trace_gaps"."status" in ('open', 'resolved', 'accepted_unknown')),
	CONSTRAINT "trace_gaps_certainty_ck" CHECK("__new_trace_gaps"."certainty" in ('unknown', 'assumed', 'inferred', 'visually_observed', 'test_verified', 'documentation_verified', 'conflicting')),
	CONSTRAINT "trace_gaps_endpoints_ck" CHECK("__new_trace_gaps"."from_node_id" is not null or "__new_trace_gaps"."to_node_id" is not null or "__new_trace_gaps"."from_asset_id" is not null or "__new_trace_gaps"."to_asset_id" is not null),
	CONSTRAINT "trace_gaps_resolution_ck" CHECK("__new_trace_gaps"."status" = 'open' or "__new_trace_gaps"."resolved_at" is not null),
	CONSTRAINT "trace_gaps_revision_ck" CHECK("__new_trace_gaps"."revision" >= 1)
);
--> statement-breakpoint
INSERT INTO `__new_trace_gaps`("id", "property_id", "wiring_configuration_id", "from_node_id", "to_node_id", "from_asset_id", "to_asset_id", "status", "certainty", "description", "resolved_at", "revision", "created_at", "updated_at") SELECT tg."id", tg."property_id", wc."id", tg."from_node_id", tg."to_node_id", tg."from_asset_id", tg."to_asset_id", tg."status", tg."certainty", tg."description", tg."resolved_at", tg."revision", tg."created_at", tg."updated_at" FROM `trace_gaps` tg JOIN `wiring_configurations` wc ON wc."property_id" = tg."property_id" AND wc."status" = 'current';--> statement-breakpoint
DROP TABLE `trace_gaps`;--> statement-breakpoint
ALTER TABLE `__new_trace_gaps` RENAME TO `trace_gaps`;--> statement-breakpoint
CREATE INDEX `trace_gaps_status_idx` ON `trace_gaps` (`property_id`,`wiring_configuration_id`,`status`);--> statement-breakpoint
CREATE INDEX `trace_gaps_from_node_idx` ON `trace_gaps` (`property_id`,`wiring_configuration_id`,`from_node_id`);--> statement-breakpoint
CREATE INDEX `trace_gaps_to_node_idx` ON `trace_gaps` (`property_id`,`wiring_configuration_id`,`to_node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `trace_gaps_property_id_id_uq` ON `trace_gaps` (`property_id`,`id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
