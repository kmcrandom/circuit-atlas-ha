import { expect, test } from "@playwright/test";

test("introduces the product without house-specific data", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Map the house behind the walls." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create your first property" }),
  ).toBeVisible();
  await expect(page.getByText("Private workspace")).toBeVisible();
});

test("property onboarding remains usable at a mobile viewport", async ({ page }) => {
  await page.goto("/properties");
  await expect(
    page.getByRole("heading", { name: "Choose a house to map." }),
  ).toBeVisible();
  const propertyName = page.getByLabel("Property name");
  const addProperty = page.getByRole("button", { name: "Add property" });
  await expect(propertyName.or(addProperty)).toBeVisible();
  if (await addProperty.isVisible()) {
    await addProperty.click();
  }
  await expect(propertyName).toBeVisible();
  await expect(propertyName).toBeEditable();
  await expect(page.getByRole("button", { name: "Create property" })).toBeVisible();
});

test("Home Assistant ingress works beneath its dynamic path prefix", async ({ page }) => {
  const ingressPath = "/api/hassio_ingress/fictional-test-token";
  await page.setExtraHTTPHeaders({
    "x-ingress-path": ingressPath,
    "x-remote-user-id": "fictional-ha-owner",
    "x-remote-user-display-name": "Fictional Owner",
  });
  await page.goto(`${ingressPath}/`);
  await expect(
    page.getByRole("heading", { name: "Map the house behind the walls." }),
  ).toBeVisible();

  const propertyLink = page.getByRole("link", {
    name: "Create your first property",
  });
  await expect(propertyLink).toHaveAttribute(
    "href",
    `${ingressPath}/properties?new=1`,
  );
  await propertyLink.click();
  await expect(page).toHaveURL(new RegExp(`${ingressPath}/properties\\?new=1$`));
  await expect(
    page.getByRole("heading", { name: "Choose a house to map." }),
  ).toBeVisible();
});

test("creates named locations without codes and stores structured bulb specifications", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const propertyName = `Fictional property ${suffix}`;
  await page.goto("/properties?new=1");
  const propertyNameField = page.getByLabel("Property name");
  const addProperty = page.getByRole("button", { name: "Add property" });
  await expect(propertyNameField.or(addProperty)).toBeVisible();
  if (await addProperty.isVisible()) {
    await addProperty.click();
  }
  await propertyNameField.fill(propertyName);
  await page.getByRole("button", { name: "Create property" }).click();
  await expect(page).toHaveURL(/\/p\/[^/]+\/map/);
  const propertyId = page.url().match(/\/p\/([^/]+)\//)?.[1];
  expect(propertyId).toBeTruthy();

  await page.goto(`/p/${propertyId}/settings`);
  await expect(page.getByRole("heading", { name: "Set up locations" })).toBeVisible();
  await expect(page.getByLabel(/structure code/i)).toHaveCount(0);
  await expect(page.getByLabel(/level code/i)).toHaveCount(0);
  await expect(page.getByLabel(/space code/i)).toHaveCount(0);

  const structureName = `Structure ${suffix}`;
  const levelName = `Level ${suffix}`;
  const spaceName = `Room ${suffix}`;
  const zoneName = `North wall ${suffix}`;
  await page.getByLabel("Structure name").fill(structureName);
  await page.getByRole("button", { name: "Create structure" }).click();
  await expect(page.getByText(`${structureName} was created.`)).toBeVisible();
  await page.getByLabel("Level name").fill(levelName);
  await page.getByRole("button", { name: "Create level" }).click();
  await expect(page.getByText(`${levelName} was created.`)).toBeVisible();
  await page.getByPlaceholder("Name this room or area").fill(spaceName);
  await page.getByRole("button", { name: "Create room or space" }).click();
  await expect(page.getByText(`${spaceName} was created.`)).toBeVisible();
  await page.getByLabel("Wall or zone name").fill(zoneName);
  await page.getByLabel("Orientation").fill("North");
  await page.getByRole("button", { name: "Create wall or zone" }).click();
  await expect(page.getByText(`${zoneName} was created.`)).toBeVisible();

  await page.goto(`/p/${propertyId}/inventory`);
  await page.getByRole("button", { name: "Add the first record" }).click();
  const dialog = page.getByRole("dialog", { name: "Add inventory record" });
  await dialog.getByLabel("Display name").fill(`Fixture ${suffix}`);
  await dialog.getByLabel("Record type").selectOption("fixture");
  await dialog.getByRole("button", { name: "Add light source" }).click();
  await dialog.getByRole("spinbutton", { name: /^Actual wattage/ }).fill("8.5");
  await dialog.getByRole("spinbutton", { name: /^Wattage equivalent/ }).fill("60");
  await dialog.getByRole("spinbutton", { name: "Light output (lumens)" }).fill("800");
  await dialog.getByRole("spinbutton", { name: "Minimum supported temperature (K)" }).fill("2200");
  await dialog.getByRole("spinbutton", { name: /^Maximum supported temperature/ }).fill("6500");
  await dialog.getByRole("combobox", { name: "Color capability" }).selectOption("tunable-white");
  await dialog.getByRole("combobox", { name: "Dimmable" }).selectOption("yes");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(dialog).toBeHidden();

  const response = await page.request.get(`/api/p/${propertyId}/assets`);
  expect(response.ok()).toBe(true);
  const inventory = await response.json() as { items: Array<{ displayName: string; lightSources?: Array<Record<string, unknown>> }> };
  const bulb = inventory.items.find((item) => item.displayName === `Fixture ${suffix}`)?.lightSources?.[0];
  expect(bulb).toMatchObject({
    wattage: 8.5,
    equivalentWattage: 60,
    lumens: 800,
    colorTemperatureMinKelvin: 2200,
    colorTemperatureMaxKelvin: 6500,
    colorCapability: "tunable-white",
    dimmable: true,
  });
});

test("primary settings actions retain legible text before and during hover", async ({
  page,
}, testInfo) => {
  await page.goto("/properties?new=1");
  const propertyName = page.getByLabel("Property name");
  const addProperty = page.getByRole("button", { name: "Add property" });
  await expect(propertyName.or(addProperty)).toBeVisible();
  if (await addProperty.isVisible()) await addProperty.click();
  await propertyName.fill(`Contrast test ${testInfo.project.name}`);
  await page.getByRole("button", { name: "Create property" }).click();
  await expect(page).toHaveURL(/\/p\/[^/]+\/map$/);

  const propertyId = new URL(page.url()).pathname.split("/")[2];
  await page.goto(`/p/${encodeURIComponent(propertyId)}/settings`);

  const actions = [
    page.getByRole("link", { name: "Open map" }).first(),
    page.getByRole("button", { name: "Save details" }),
    page.getByRole("button", { name: "Create structure" }),
    page.getByRole("button", { name: "Create level" }),
    page.getByRole("button", { name: "Create room or space" }),
  ];

  for (const action of actions) {
    await expect(action).toBeVisible();
    await expect(action).toHaveCSS("color", "rgb(255, 255, 255)");
  }

  const saveDetails = page.getByRole("button", { name: "Save details" });
  await saveDetails.hover();
  await expect(saveDetails).toHaveCSS("color", "rgb(255, 255, 255)");
});
