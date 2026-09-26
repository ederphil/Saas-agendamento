import { test, expect } from "@playwright/test";
import { DateTime } from "luxon";
test("autocadastro, tutor, pet, agendamento, persistência e mobile", async ({
  page,
}) => {
  const stamp = Date.now();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/b/petflow");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome do estabelecimento").fill("Pet UI " + stamp);
  await page.getByLabel("Seu nome").fill("Ana Teste");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(`ui-${stamp}@test.local`);
  await page
    .getByLabel("Senha (mínimo de 10 caracteres)")
    .fill("TesteSeguro123");
  await page.getByRole("button", { name: "Criar meu espaço" }).click();
  await expect(page.getByRole("heading", { name: "Olá, Ana" })).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Tutores", exact: true })
    .click();
  await page.getByRole("button", { name: "Adicionar tutor" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Maria UI");
  await page.getByLabel("Telefone / WhatsApp").fill("51999999999");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Maria UI" })).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pets", exact: true })
    .click();
  await page.getByRole("button", { name: "Adicionar pet" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Thor UI");
  await page
    .getByLabel("Tutor", { exact: true })
    .selectOption({ label: "Maria UI" });
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Thor UI" })).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: /^Agenda/ })
    .click();
  await page
    .getByRole("button", { name: "Novo agendamento", exact: true })
    .click();
  await page
    .getByLabel("Tutor", { exact: true })
    .selectOption({ label: "Maria UI" });
  await page
    .getByLabel("Pet", { exact: true })
    .selectOption({ label: "Thor UI" });
  await page.getByLabel("Serviço", { exact: true }).selectOption({ index: 1 });
  await page
    .getByLabel("Profissional", { exact: true })
    .selectOption({ index: 1 });
  const date = DateTime.now()
    .setZone("America/Sao_Paulo")
    .plus({ weeks: 2 })
    .startOf("week")
    .toISODate()!;
  await page.getByLabel("Data", { exact: true }).fill(date);
  await page.getByLabel("Horário", { exact: true }).fill("09:00");
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Agendamento confirmado",
  );
  await page.getByLabel("Data da agenda").fill(date);
  await expect(page.getByRole("table")).toContainText("Thor UI");
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: /^Agenda/ })
    .click();
  await page.getByLabel("Data da agenda").fill(date);
  await expect(page.getByRole("table")).toContainText("Thor UI");
  await page.getByRole("button", { name: "Semana", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Thor UI");
  await page.screenshot({ path: ".data/ui-agenda.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Olá, Ana" })).toBeVisible();
  await page.screenshot({ path: ".data/ui-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("marca barber tem identidade própria e não mostra pets", async ({
  page,
}) => {
  await page.goto("/b/barberflow");
  await expect(
    page.getByRole("heading", { name: "Sua agenda no ponto." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome do estabelecimento").fill("Barbearia UI");
  await page.getByLabel("Seu nome").fill("João Teste");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(`barber-ui-${Date.now()}@test.local`);
  await page
    .getByLabel("Senha (mínimo de 10 caracteres)")
    .fill("TesteSeguro123");
  await page.getByRole("button", { name: "Criar meu espaço" }).click();
  await expect(page.getByRole("heading", { name: "Olá, João" })).toBeVisible();
  await expect(
    page.locator("nav").getByRole("button", { name: "Pets", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Barbeiros", exact: true }),
  ).toBeVisible();
});
