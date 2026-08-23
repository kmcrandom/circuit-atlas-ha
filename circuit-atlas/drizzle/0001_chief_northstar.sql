PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_light_sources` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`fixture_asset_id` text NOT NULL,
	`lamp_holder_id` text,
	`technology` text,
	`bulb_type` text,
	`base_type` text,
	`watts` real,
	`equivalent_watts` real,
	`lumens` real,
	`color_temperature_kelvin` integer,
	`color_temperature_min_kelvin` integer,
	`color_temperature_max_kelvin` integer,
	`color_capability` text,
	`dimmable` integer,
	`smart_state` text DEFAULT 'unknown' NOT NULL,
	`integrated` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`property_id`,`asset_id`) REFERENCES `assets`(`property_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`fixture_asset_id`) REFERENCES `fixtures`(`property_id`,`asset_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`property_id`,`fixture_asset_id`,`lamp_holder_id`) REFERENCES `lamp_holders`(`property_id`,`fixture_asset_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "light_sources_smart_state_ck" CHECK("__new_light_sources"."smart_state" in ('smart', 'dumb', 'unknown', 'not_applicable')),
	CONSTRAINT "light_sources_watts_ck" CHECK("__new_light_sources"."watts" is null or "__new_light_sources"."watts" >= 0),
	CONSTRAINT "light_sources_equivalent_watts_ck" CHECK("__new_light_sources"."equivalent_watts" is null or "__new_light_sources"."equivalent_watts" >= 0),
	CONSTRAINT "light_sources_lumens_ck" CHECK("__new_light_sources"."lumens" is null or "__new_light_sources"."lumens" >= 0),
	CONSTRAINT "light_sources_kelvin_ck" CHECK("__new_light_sources"."color_temperature_kelvin" is null or "__new_light_sources"."color_temperature_kelvin" > 0),
	CONSTRAINT "light_sources_min_kelvin_ck" CHECK("__new_light_sources"."color_temperature_min_kelvin" is null or "__new_light_sources"."color_temperature_min_kelvin" > 0),
	CONSTRAINT "light_sources_max_kelvin_ck" CHECK("__new_light_sources"."color_temperature_max_kelvin" is null or "__new_light_sources"."color_temperature_max_kelvin" > 0),
	CONSTRAINT "light_sources_kelvin_range_ck" CHECK("__new_light_sources"."color_temperature_min_kelvin" is null or "__new_light_sources"."color_temperature_max_kelvin" is null or "__new_light_sources"."color_temperature_max_kelvin" >= "__new_light_sources"."color_temperature_min_kelvin"),
	CONSTRAINT "light_sources_color_capability_ck" CHECK("__new_light_sources"."color_capability" is null or "__new_light_sources"."color_capability" in ('fixed_white', 'tunable_white', 'full_color', 'custom'))
);
--> statement-breakpoint
INSERT INTO `__new_light_sources`("asset_id", "property_id", "fixture_asset_id", "lamp_holder_id", "technology", "bulb_type", "base_type", "watts", "lumens", "color_temperature_kelvin", "smart_state", "integrated") SELECT "asset_id", "property_id", "fixture_asset_id", "lamp_holder_id", "technology", "bulb_type", "base_type", "watts", "lumens", "color_temperature_kelvin", "smart_state", "integrated" FROM `light_sources`;--> statement-breakpoint
DROP TABLE `light_sources`;--> statement-breakpoint
ALTER TABLE `__new_light_sources` RENAME TO `light_sources`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `light_sources_fixture_idx` ON `light_sources` (`property_id`,`fixture_asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `light_sources_property_asset_uq` ON `light_sources` (`property_id`,`asset_id`);
