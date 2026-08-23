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
  await expect(page).toHaveURL(
    `http://localhost:3000${ingressPath}/properties?new=1`,
  );
  await expect(
    page.getByRole("heading", { name: "Choose a house to map." }),
  ).toBeVisible();
});
