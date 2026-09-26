import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { DateTime } from "luxon";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  LogOut,
  PawPrint,
  Plus,
  Search,
  Scissors,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  CircleHelp,
  Menu,
  ArrowRight,
  Ban,
} from "lucide-react";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "./styles.css";
type Brand = {
  id: string;
  name: string;
  vertical: string;
  resourceLabel: string;
  customerLabel: string;
  tagline: string;
  description: string;
  accent: string;
  hasPets: boolean;
};
type Customer = { id: string; name: string; phone: string; email: string };
type Resource = {
  id: string;
  name: string;
  days: number[];
  opens: string;
  closes: string;
};
type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
};
type Pet = {
  id: string;
  name: string;
  customer_id: string;
  breed: string;
  species: string;
  size: string;
  booking_id?: string;
};
type Booking = {
  id: string;
  customer_id: string;
  resource_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  status: string;
  notes: string;
};
type Block = {
  id: string;
  resource_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
};
type State = {
  csrf: string;
  account: {
    tenant_id: string;
    tenant_name: string;
    name: string;
    email: string;
    timezone: string;
  };
  customers: Customer[];
  services: Service[];
  resources: Resource[];
  bookings: Booking[];
  pets: Pet[];
  blocks: Block[];
  subscription: { status: string; trial_ends_at: string };
};
const brandId = location.pathname.match(/^\/b\/([a-z]+)/)?.[1] ?? "petflow";
const base = `/api/${brandId}`;
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value / 100,
  );
const statusLabel: Record<string, string> = {
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
function Logo({ brand, light = false }: { brand: Brand; light?: boolean }) {
  return (
    <div className={`logo ${light ? "light" : ""}`}>
      <span className="logo-icon">
        {brand.hasPets ? <PawPrint size={23} /> : <Scissors size={23} />}
      </span>
      <span>{brand.name}</span>
    </div>
  );
}
function App() {
  const [brand, setBrand] = useState<Brand | null>(null),
    [state, setState] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState("");
  const [view, setView] = useState("overview"),
    [modal, setModal] = useState(""),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [nav, setNav] = useState(false);
  const [date, setDate] = useState(
      DateTime.now().setZone("America/Sao_Paulo").toISODate()!,
    ),
    [period, setPeriod] = useState("day"),
    [resourceFilter, setResourceFilter] = useState(""),
    [selectedCustomer, setSelectedCustomer] = useState(""),
    [editing, setEditing] = useState<Booking | null>(null);
  async function api(path: string, body?: unknown, method = "POST") {
    const response = await fetch(base + path, {
      method: body === undefined && method === "POST" ? "GET" : method,
      headers: {
        "Content-Type": "application/json",
        ...(state ? { "X-CSRF-Token": state.csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && state) setState(null);
      throw new Error(data.error ?? "Não foi possível carregar os dados.");
    }
    return data;
  }
  async function reload() {
    const data = await api("/state");
    setState(data);
    return data as State;
  }
  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(base + "/brand");
        if (!response.ok)
          throw new Error("Produto não encontrado. Confira o endereço.");
        const product = (await response.json()) as Brand;
        setBrand(product);
        document.title = `${product.name} · Sua agenda, mais leve`;
        const session = await fetch(base + "/state");
        if (session.ok) setState(await session.json());
        else if (session.status !== 401)
          throw new Error("Não foi possível consultar sua sessão.");
      } catch (e) {
        setFatal((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!modal) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setModal("");
        setError("");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal, busy]);
  if (loading)
    return (
      <div className="loading">
        <PawPrint />
        <p>Preparando sua agenda…</p>
      </div>
    );
  if (fatal || !brand)
    return (
      <div className="loading">
        <h1>Não foi possível abrir o produto</h1>
        <p>{fatal}</p>
        <button onClick={() => location.reload()}>Tentar novamente</button>
      </div>
    );
  const currentBrand = brand;
  const theme = { "--accent": brand.accent } as React.CSSProperties;
  if (!state)
    return <Auth brand={brand} api={api} onLogin={reload} theme={theme} />;
  const s = state,
    zone = s.account.timezone,
    local = (iso: string) => DateTime.fromISO(iso).setZone(zone),
    day = DateTime.fromISO(date, { zone });
  const pets = Array.from(new Map(s.pets.map((p) => [p.id, p])).values());
  const petFor = (b: Booking) => s.pets.find((p) => p.booking_id === b.id);
  const customerFor = (b: Booking) =>
    s.customers.find((c) => c.id === b.customer_id);
  const serviceFor = (b: Booking) =>
    s.services.find((c) => c.id === b.service_id);
  const resourceFor = (b: Booking) =>
    s.resources.find((c) => c.id === b.resource_id);
  const todayBookings = s.bookings.filter(
    (b) => local(b.starts_at).toISODate() === date,
  );
  const live = todayBookings.filter((b) => b.status !== "cancelled");
  const completed = todayBookings.filter((b) => b.status === "completed");
  const weekStart = day.startOf("week"),
    days =
      period === "week"
        ? Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }))
        : [day];
  const filtered = s.bookings.filter(
    (b) =>
      days.some((d) => d.toISODate() === local(b.starts_at).toISODate()) &&
      (!resourceFilter || b.resource_id === resourceFilter) &&
      [customerFor(b)?.name, serviceFor(b)?.name, petFor(b)?.name]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const open = (type: string) => {
    setError("");
    setSelectedCustomer("");
    setEditing(null);
    setModal(type);
  };
  const navigate = (v: string) => {
    setView(v);
    setSearch("");
    setNav(false);
  };
  const tabNames: Record<string, string> = {
    overview: "Visão geral",
    agenda: "Agenda",
    customers: brand.customerLabel,
    pets: "Pets",
    services: "Serviços",
    resources: brand.resourceLabel,
    settings: "Meu estabelecimento",
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (modal === "customers")
        await api("/customers", {
          name: data.name,
          phone: data.phone,
          email: data.email,
        });
      if (modal === "pets")
        await api("/pets", {
          name: data.name,
          customerId: data.customerId,
          species: data.species,
          breed: data.breed,
          size: data.size,
          notes: "",
        });
      if (modal === "services")
        await api("/services", {
          name: data.name,
          durationMinutes: Number(data.duration),
          priceCents: Math.round(Number(data.price) * 100),
        });
      if (modal === "resources")
        await api("/resources", {
          name: data.name,
          days: new FormData(event.currentTarget).getAll("days").map(Number),
          opens: data.opens,
          closes: data.closes,
        });
      if (modal === "booking") {
        const start = DateTime.fromISO(`${data.date}T${data.time}`, { zone });
        if (!start.isValid || start.toFormat("HH:mm") !== data.time)
          throw new Error("Horário inválido para o fuso do estabelecimento.");
        await api("/bookings", {
          customerId: data.customerId,
          resourceId: data.resourceId,
          serviceId: data.serviceId,
          startsAt: start.toUTC().toISO(),
          notes: data.notes,
          ...(currentBrand.hasPets ? { extension: { petId: data.petId } } : {}),
        });
      }
      if (modal === "move" && editing)
        await api(
          "/bookings/" + editing.id,
          {
            startsAt: DateTime.fromISO(`${data.date}T${data.time}`, { zone })
              .toUTC()
              .toISO(),
          },
          "PATCH",
        );
      if (modal === "block")
        await api("/blocks", {
          resourceId: data.resourceId,
          startsAt: DateTime.fromISO(`${data.date}T${data.time}`, { zone })
            .toUTC()
            .toISO(),
          endsAt: DateTime.fromISO(`${data.date}T${data.endTime}`, { zone })
            .toUTC()
            .toISO(),
          reason: data.reason,
        });
      await reload();
      setModal("");
      setToast(
        modal === "booking"
          ? "Agendamento confirmado. Tudo certo!"
          : "Salvo com sucesso.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function status(b: Booking, value: string) {
    setError("");
    setBusy(true);
    try {
      await api(`/bookings/${b.id}/status`, { status: value });
      await reload();
      setModal("");
      setToast("Agendamento atualizado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const table = (list: Booking[]) =>
    list.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Horário</th>
              <th>{brand.hasPets ? "Pet / tutor" : "Cliente"}</th>
              <th>Serviço</th>
              <th>Profissional</th>
              <th>Status</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td className="time">
                  <strong>{local(b.starts_at).toFormat("HH:mm")}</strong>
                  <small>até {local(b.ends_at).toFormat("HH:mm")}</small>
                </td>
                <td>
                  <div className="person">
                    <span className="avatar">
                      {brand.hasPets ? (
                        <PawPrint size={18} />
                      ) : (
                        initials(customerFor(b)?.name ?? "")
                      )}
                    </span>
                    <span>
                      <strong>
                        {brand.hasPets ? petFor(b)?.name : customerFor(b)?.name}
                      </strong>
                      <small>
                        {brand.hasPets
                          ? customerFor(b)?.name
                          : customerFor(b)?.phone}
                      </small>
                    </span>
                  </div>
                </td>
                <td>{serviceFor(b)?.name}</td>
                <td>{resourceFor(b)?.name}</td>
                <td>
                  <span className={"status " + b.status}>
                    <i />
                    {statusLabel[b.status]}
                  </span>
                </td>
                <td className="price">{money(b.price_cents)}</td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Detalhes do agendamento de ${customerFor(b)?.name} às ${local(b.starts_at).toFormat("HH:mm")}`}
                    onClick={() => {
                      setEditing(b);
                      setError("");
                      setModal("detail");
                    }}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        icon={<CalendarDays />}
        title="Um espaço livre na sua agenda"
        text="Organize o próximo atendimento e deixe tudo pronto para receber seu cliente."
        action="Agendar atendimento"
        onClick={() => open("booking")}
      />
    );
  const navItems = [
    { id: "overview", label: "Visão geral", icon: LayoutDashboard },
    { id: "agenda", label: "Agenda", icon: CalendarDays },
    { id: "customers", label: brand.customerLabel, icon: Users },
    ...(brand.hasPets ? [{ id: "pets", label: "Pets", icon: PawPrint }] : []),
    { id: "services", label: "Serviços", icon: Scissors },
    { id: "resources", label: brand.resourceLabel, icon: Users },
  ];
  return (
    <div className="shell" style={theme}>
      <aside className={"sidebar " + (nav ? "visible" : "")}>
        <Logo brand={brand} light />
        <div className="workspace">
          <span className="workspace-avatar">
            {initials(s.account.tenant_name)}
          </span>
          <span>
            <strong>{s.account.tenant_name}</strong>
            <small>Seu espaço de atendimento</small>
          </span>
        </div>
        <p className="nav-label">ROTINA</p>
        <nav>
          {navItems.map((item) => (
            <button
              className={view === item.id ? "active" : ""}
              key={item.id}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === "agenda" && (
                <span className="nav-count">{live.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="trial-card">
            <Sparkles size={20} />
            <strong>Comece no seu ritmo</strong>
            <p>
              Seu período de avaliação termina em{" "}
              {local(s.subscription.trial_ends_at).toFormat("dd/MM")}.
            </p>
            <span>Sem cobrança nesta versão</span>
          </div>
          <button onClick={() => navigate("settings")}>
            <Settings2 size={18} />
            Meu estabelecimento
          </button>
          <button
            onClick={async () => {
              try {
                await api("/auth/logout", {});
                setState(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={18} />
            Sair da conta
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-button"
              aria-label="Abrir menu"
              onClick={() => setNav(!nav)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              Meu espaço <ChevronRight size={14} />{" "}
              <strong>{tabNames[view]}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="safe-note">
              <span />
              Tudo organizado por aqui
            </span>
            <span className="profile">{initials(s.account.name)}</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {view === "overview"
                  ? "SUA ROTINA, MAIS LEVE"
                  : "SEU ESPAÇO DE TRABALHO"}
              </p>
              <h1>
                {view === "overview"
                  ? `Olá, ${s.account.name.split(" ")[0]} ☀`
                  : tabNames[view]}
              </h1>
              <p>
                {view === "overview"
                  ? "Cada atendimento merece tempo e cuidado. Vamos organizar o dia?"
                  : view === "agenda"
                    ? "Um lugar para acompanhar todos os seus atendimentos."
                    : `Tudo o que você precisa para cuidar da sua rotina.`}
              </p>
            </div>
            {["overview", "agenda"].includes(view) ? (
              <button className="primary" onClick={() => open("booking")}>
                <Plus size={19} />
                Novo agendamento
              </button>
            ) : (
              ["customers", "pets", "services", "resources"].includes(view) && (
                <button className="primary" onClick={() => open(view)}>
                  <Plus size={19} />
                  Adicionar{" "}
                  {view === "pets"
                    ? "pet"
                    : view === "customers"
                      ? brand.hasPets
                        ? "tutor"
                        : "cliente"
                      : view === "services"
                        ? "serviço"
                        : "profissional"}
                </button>
              )
            )}
          </div>
          {s.account.email.endsWith("@demo.local") && (
            <div className="demo-banner">
              <Sparkles size={16} />
              Ambiente de demonstração · Todos os nomes e atendimentos são
              fictícios.
            </div>
          )}
          {error && !modal && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {view === "overview" && (
            <>
              <div className="overview-date">
                <CalendarDays size={17} />
                {day.setLocale("pt-BR").toFormat("cccc, dd 'de' LLLL")}
                <span>Seu dia em números</span>
              </div>
              <div className="stats">
                <Stat
                  label="Atendimentos no dia"
                  value={String(live.length).padStart(2, "0")}
                  note={`${live.filter((b) => b.status === "confirmed").length} na sua agenda`}
                  icon={<CalendarDays />}
                />
                <Stat
                  label="Atendimentos concluídos"
                  value={String(completed.length).padStart(2, "0")}
                  note="Cuidado entregue"
                  icon={<Check />}
                />
                <Stat
                  label="Valor previsto do dia"
                  value={money(live.reduce((n, b) => n + b.price_cents, 0))}
                  note="Serviços ativos · não é valor recebido"
                  icon={<ArrowUpRight />}
                />
                <Stat
                  label={
                    brand.hasPets ? "Pets cadastrados" : "Clientes cadastrados"
                  }
                  value={String(
                    brand.hasPets ? pets.length : s.customers.length,
                  ).padStart(2, "0")}
                  note="Cada história, um cuidado"
                  icon={brand.hasPets ? <PawPrint /> : <Users />}
                />
              </div>
              <div className="overview-grid">
                <section className="panel agenda-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Agenda do dia{" "}
                        <span className="count">{todayBookings.length}</span>
                      </h2>
                      <p>Os próximos encontros começam aqui.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("agenda")}
                    >
                      Ver agenda <ArrowRight size={15} />
                    </button>
                  </div>
                  {table(todayBookings)}
                </section>
                <section className="care-card">
                  <span className="care-icon">
                    {brand.hasPets ? (
                      <PawPrint size={31} />
                    ) : (
                      <Sparkles size={31} />
                    )}
                  </span>
                  <p className="eyebrow">PEQUENOS PASSOS</p>
                  <h2>
                    Uma rotina mais leve
                    <br />
                    começa por aqui.
                  </h2>
                  <p>
                    Cadastre seus clientes e serviços para encontrar tudo na
                    hora de agendar.
                  </p>
                  <button onClick={() => navigate("customers")}>
                    Organizar cadastros <ArrowRight size={17} />
                  </button>
                  <div className="care-decoration">✳</div>
                </section>
              </div>
              <div className="bottom-grid">
                <section className="panel compact">
                  <h2>Pronto para atender</h2>
                  <div className="setup-items">
                    {[
                      {
                        label: "Profissionais",
                        n: s.resources.length,
                        view: "resources",
                      },
                      {
                        label: "Serviços",
                        n: s.services.length,
                        view: "services",
                      },
                      {
                        label: brand.customerLabel,
                        n: s.customers.length,
                        view: "customers",
                      },
                    ].map((x) => (
                      <button key={x.view} onClick={() => navigate(x.view)}>
                        <span className="setup-check">
                          {x.n ? <Check size={16} /> : <Plus size={16} />}
                        </span>
                        {x.label}
                        <strong>{x.n}</strong>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel compact tip">
                  <ShieldCheck size={30} />
                  <div>
                    <h2>Seu espaço, seus dados</h2>
                    <p>
                      Os cadastros e a agenda pertencem somente ao seu
                      estabelecimento. Cada equipe tem seu próprio acesso.
                    </p>
                  </div>
                </section>
              </div>
            </>
          )}
          {view === "agenda" && (
            <>
              <div className="toolbar">
                <div className="date-controls">
                  <button
                    className="icon-button"
                    aria-label="Período anterior"
                    onClick={() =>
                      setDate(
                        day
                          .minus({ days: period === "week" ? 7 : 1 })
                          .toISODate()!,
                      )
                    }
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <input
                    aria-label="Data da agenda"
                    type="date"
                    value={date}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                  />
                  <button
                    className="icon-button"
                    aria-label="Próximo período"
                    onClick={() =>
                      setDate(
                        day
                          .plus({ days: period === "week" ? 7 : 1 })
                          .toISODate()!,
                      )
                    }
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      setDate(DateTime.now().setZone(zone).toISODate()!)
                    }
                  >
                    Hoje
                  </button>
                </div>
                <div className="toolbar-right">
                  <div className="segmented">
                    <button
                      className={period === "day" ? "selected" : ""}
                      onClick={() => setPeriod("day")}
                    >
                      Dia
                    </button>
                    <button
                      className={period === "week" ? "selected" : ""}
                      onClick={() => setPeriod("week")}
                    >
                      Semana
                    </button>
                  </div>
                  <button className="secondary" onClick={() => open("block")}>
                    <Ban size={16} />
                    Bloquear horário
                  </button>
                </div>
              </div>
              <div className="filters">
                <label className="search">
                  <Search size={18} />
                  <input
                    placeholder="Buscar cliente, pet ou serviço"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filtrar profissional"
                  value={resourceFilter}
                  onChange={(e) => setResourceFilter(e.target.value)}
                >
                  <option value="">Todos os profissionais</option>
                  {s.resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <span className="muted">Horários de São Paulo</span>
              </div>
              {days.map((d) => (
                <section className="panel day-panel" key={d.toISODate()}>
                  <div className="panel-heading">
                    <h2>{d.setLocale("pt-BR").toFormat("cccc, dd/MM")}</h2>
                  </div>
                  {table(
                    filtered.filter(
                      (b) => local(b.starts_at).toISODate() === d.toISODate(),
                    ),
                  )}
                </section>
              ))}
              {s.blocks.length > 0 && (
                <section className="panel compact">
                  <h2>Horários bloqueados</h2>
                  {s.blocks.map((b) => (
                    <div className="block-row" key={b.id}>
                      <Ban size={16} />
                      <span>
                        {s.resources.find((r) => r.id === b.resource_id)?.name}{" "}
                        · {local(b.starts_at).toFormat("dd/MM HH:mm")}–
                        {local(b.ends_at).toFormat("HH:mm")} · {b.reason}
                      </span>
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await api("/blocks/" + b.id, {}, "DELETE");
                            await reload();
                            setToast("Horário liberado.");
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Liberar
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          {["customers", "pets", "services", "resources"].includes(view) && (
            <section className="panel directory">
              <div className="panel-heading">
                <label className="search">
                  <Search size={18} />
                  <input
                    placeholder={`Buscar em ${tabNames[view].toLowerCase()}`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <span className="muted">Seus cadastros</span>
              </div>
              <div className="card-grid">
                {(view === "customers"
                  ? s.customers
                  : view === "pets"
                    ? pets
                    : view === "services"
                      ? s.services
                      : s.resources
                )
                  .filter((x) =>
                    x.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((x) => (
                    <div className="entity-card" key={x.id}>
                      <span className="entity-icon">
                        {view === "pets" ? (
                          <PawPrint />
                        ) : view === "services" ? (
                          <Scissors />
                        ) : (
                          <Users />
                        )}
                      </span>
                      <h3>{x.name}</h3>
                      {view === "customers" && (
                        <>
                          <p>
                            {(x as Customer).phone || "Telefone não informado"}
                          </p>
                          <small>
                            {(x as Customer).email || "Sem e-mail cadastrado"}
                          </small>
                        </>
                      )}
                      {view === "pets" && (
                        <>
                          <p>
                            {(x as Pet).species} ·{" "}
                            {(x as Pet).breed || "Raça não informada"} ·{" "}
                            {(x as Pet).size}
                          </p>
                          <small>
                            Tutor:{" "}
                            {
                              s.customers.find(
                                (c) => c.id === (x as Pet).customer_id,
                              )?.name
                            }
                          </small>
                        </>
                      )}
                      {view === "services" && (
                        <>
                          <p>
                            <Clock3 size={14} />
                            {(x as Service).duration_minutes} minutos
                          </p>
                          <strong className="service-price">
                            {money((x as Service).price_cents)}
                          </strong>
                        </>
                      )}
                      {view === "resources" && (
                        <>
                          <p>
                            {(x as Resource).opens}–{(x as Resource).closes}
                          </p>
                          <small>
                            {(x as Resource).days
                              .map(
                                (d) =>
                                  [
                                    "",
                                    "Seg",
                                    "Ter",
                                    "Qua",
                                    "Qui",
                                    "Sex",
                                    "Sáb",
                                    "Dom",
                                  ][d],
                              )
                              .join(" · ")}
                          </small>
                        </>
                      )}
                    </div>
                  ))}
              </div>
              {!(
                view === "customers"
                  ? s.customers
                  : view === "pets"
                    ? pets
                    : view === "services"
                      ? s.services
                      : s.resources
              ).filter((x) =>
                x.name.toLowerCase().includes(search.toLowerCase()),
              ).length && (
                <Empty
                  icon={<Search />}
                  title={
                    search
                      ? "Nenhum resultado encontrado"
                      : "Vamos fazer o primeiro cadastro?"
                  }
                  text={
                    search
                      ? "Tente buscar por outro nome."
                      : "Comece com as informações essenciais. Você poderá agendar em seguida."
                  }
                  action={search ? "Limpar busca" : "Adicionar cadastro"}
                  onClick={() => (search ? setSearch("") : open(view))}
                />
              )}
            </section>
          )}
          {view === "settings" && (
            <section className="panel compact settings">
              <h2>{s.account.tenant_name}</h2>
              <dl>
                <dt>Produto</dt>
                <dd>{brand.name}</dd>
                <dt>Responsável</dt>
                <dd>{s.account.name}</dd>
                <dt>E-mail de acesso</dt>
                <dd>{s.account.email}</dd>
                <dt>Fuso horário</dt>
                <dd>{zone}</dd>
                <dt>Assinatura</dt>
                <dd>
                  Avaliação · até{" "}
                  {local(s.subscription.trial_ends_at).toFormat("dd/MM/yyyy")}
                </dd>
              </dl>
              <div className="info">
                <CircleHelp size={19} />
                <p>
                  Esta é a primeira versão do produto. Cobrança automática,
                  lembretes e agendamento público ainda estão em
                  desenvolvimento.
                </p>
              </div>
            </section>
          )}
          <footer>
            {brand.name} · Feito para cuidar da sua rotina.
            <span>Primeira versão · 0.1</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setModal("");
              setError("");
            }
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <header>
              <div>
                <p className="eyebrow">{brand.name}</p>
                <h2 id="modal-title">
                  {
                    {
                      booking: "Novo agendamento",
                      customers: brand.hasPets ? "Novo tutor" : "Novo cliente",
                      pets: "Novo pet",
                      services: "Novo serviço",
                      resources: "Novo profissional",
                      move: "Reagendar atendimento",
                      detail: "Detalhes do atendimento",
                      cancel: "Cancelar atendimento",
                      block: "Bloquear horário",
                    }[modal]
                  }
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Fechar"
                onClick={() => {
                  setModal("");
                  setError("");
                }}
                disabled={busy}
              >
                <X />
              </button>
            </header>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {modal === "detail" && editing ? (
              <>
                <div className="detail">
                  <h3>
                    {brand.hasPets
                      ? petFor(editing)?.name
                      : customerFor(editing)?.name}
                  </h3>
                  <p>
                    {serviceFor(editing)?.name} · {resourceFor(editing)?.name}
                  </p>
                  <strong>
                    {local(editing.starts_at).toFormat("dd/MM/yyyy · HH:mm")}–
                    {local(editing.ends_at).toFormat("HH:mm")}
                  </strong>
                  <p>
                    {money(editing.price_cents)} · {statusLabel[editing.status]}
                  </p>
                  <p>{editing.notes || "Nenhuma observação."}</p>
                </div>
                {editing.status === "confirmed" && (
                  <div className="detail-actions">
                    <button
                      className="secondary"
                      onClick={() => setModal("move")}
                    >
                      Reagendar
                    </button>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => setModal("cancel")}
                    >
                      Cancelar atendimento
                    </button>
                    <button
                      className="primary"
                      disabled={
                        busy || +new Date(editing.starts_at) > Date.now()
                      }
                      onClick={() => status(editing, "completed")}
                    >
                      <Check size={17} />
                      Concluir
                    </button>
                  </div>
                )}
              </>
            ) : modal === "cancel" && editing ? (
              <>
                <h3>Cancelar este atendimento?</h3>
                <p>
                  O horário será liberado. O atendimento continuará no histórico
                  como cancelado.
                </p>
                <div className="form-actions">
                  <button
                    className="secondary"
                    onClick={() => setModal("detail")}
                  >
                    Voltar
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => status(editing, "cancelled")}
                  >
                    Confirmar cancelamento
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={save}>
                {["customers", "pets", "services", "resources"].includes(
                  modal,
                ) && (
                  <Field label="Nome">
                    <input
                      name="name"
                      autoFocus
                      required
                      minLength={2}
                      maxLength={120}
                      placeholder={
                        modal === "pets"
                          ? "Ex.: Thor"
                          : "Como você quer identificar este cadastro?"
                      }
                    />
                  </Field>
                )}
                {modal === "customers" && (
                  <>
                    <Field label="Telefone / WhatsApp">
                      <input
                        name="phone"
                        type="tel"
                        maxLength={25}
                        placeholder="(51) 99999-9999"
                      />
                    </Field>
                    <Field label="E-mail (opcional)">
                      <input name="email" type="email" maxLength={200} />
                    </Field>
                  </>
                )}
                {(modal === "pets" || modal === "booking") && (
                  <Field label={brand.hasPets ? "Tutor" : "Cliente"}>
                    <select
                      name="customerId"
                      required
                      value={selectedCustomer}
                      onChange={(e) => setSelectedCustomer(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {s.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {modal === "pets" && (
                  <>
                    <div className="form-grid">
                      <Field label="Espécie">
                        <select name="species">
                          <option>Cão</option>
                          <option>Gato</option>
                          <option>Outro</option>
                        </select>
                      </Field>
                      <Field label="Porte">
                        <select name="size">
                          <option>Pequeno</option>
                          <option>Médio</option>
                          <option>Grande</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="Raça (opcional)">
                      <input name="breed" maxLength={80} />
                    </Field>
                  </>
                )}
                {modal === "services" && (
                  <div className="form-grid">
                    <Field label="Duração em minutos">
                      <input
                        type="number"
                        name="duration"
                        defaultValue={60}
                        min={5}
                        max={480}
                        required
                      />
                    </Field>
                    <Field label="Preço (R$)">
                      <input
                        type="number"
                        step="0.01"
                        name="price"
                        min={0}
                        max={100000}
                        required
                        placeholder="0,00"
                      />
                    </Field>
                  </div>
                )}
                {modal === "resources" && (
                  <>
                    <div className="form-grid">
                      <Field label="Início do expediente">
                        <input
                          type="time"
                          name="opens"
                          required
                          defaultValue="08:00"
                        />
                      </Field>
                      <Field label="Fim do expediente">
                        <input
                          type="time"
                          name="closes"
                          required
                          defaultValue="18:00"
                        />
                      </Field>
                    </div>
                    <fieldset>
                      <legend>Dias de atendimento</legend>
                      <div className="weekday-options">
                        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(
                          (d, i) => (
                            <label key={d}>
                              <input
                                type="checkbox"
                                name="days"
                                value={i + 1}
                                defaultChecked={i < 6}
                              />
                              {d}
                            </label>
                          ),
                        )}
                      </div>
                    </fieldset>
                  </>
                )}
                {modal === "booking" && (
                  <>
                    {brand.hasPets && (
                      <Field label="Pet">
                        <select name="petId" required key={selectedCustomer}>
                          <option value="">Selecione o pet do tutor</option>
                          {pets
                            .filter((p) => p.customer_id === selectedCustomer)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                    )}
                    <Field label="Serviço">
                      <select name="serviceId" required>
                        <option value="">Selecione um serviço</option>
                        {s.services.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} · {c.duration_minutes} min ·{" "}
                            {money(c.price_cents)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}
                {["booking", "block"].includes(modal) && (
                  <Field label="Profissional">
                    <select name="resourceId" required>
                      <option value="">Selecione</option>
                      {s.resources.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.opens}–{c.closes}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {["booking", "move", "block"].includes(modal) && (
                  <>
                    <div className="form-grid">
                      <Field label="Data">
                        <input
                          name="date"
                          type="date"
                          required
                          min={DateTime.now().setZone(zone).toISODate()!}
                          defaultValue={
                            modal === "move" && editing
                              ? local(editing.starts_at).toISODate()!
                              : date
                          }
                        />
                      </Field>
                      <Field label="Horário">
                        <input
                          name="time"
                          type="time"
                          step="60"
                          required
                          defaultValue={
                            modal === "move" && editing
                              ? local(editing.starts_at).toFormat("HH:mm")
                              : "09:00"
                          }
                        />
                      </Field>
                    </div>
                    <small className="muted">
                      Horário do estabelecimento: {zone}
                    </small>
                  </>
                )}
                {modal === "booking" && (
                  <Field label="Observações (opcional)">
                    <textarea name="notes" maxLength={500} rows={2} />
                  </Field>
                )}
                {modal === "block" && (
                  <>
                    <Field label="Horário final">
                      <input
                        name="endTime"
                        type="time"
                        required
                        defaultValue="10:00"
                      />
                    </Field>
                    <Field label="Motivo">
                      <input
                        name="reason"
                        required
                        minLength={2}
                        maxLength={120}
                        placeholder="Ex.: intervalo ou compromisso"
                      />
                    </Field>
                  </>
                )}
                {(modal === "pets" || modal === "booking") &&
                  !s.customers.length && (
                    <p className="info">
                      Cadastre um {brand.hasPets ? "tutor" : "cliente"} antes de
                      continuar.
                    </p>
                  )}
                <div className="form-actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setModal("")}
                    disabled={busy}
                  >
                    Voltar
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy
                      ? "Salvando…"
                      : modal === "booking"
                        ? "Confirmar agendamento"
                        : "Salvar"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="stat">
      <div>
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="text-button" onClick={onClick}>
        {action}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
function Auth({
  brand,
  api,
  onLogin,
  theme,
}: {
  brand: Brand;
  api: (path: string, body?: unknown) => Promise<any>;
  onLogin: () => Promise<State>;
  theme: React.CSSProperties;
}) {
  const [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("/auth/" + (mode === "login" ? "login" : "register"), data);
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth" style={theme}>
      <section className="auth-story">
        <Logo brand={brand} light />
        <div>
          <span className="pill">FEITO PARA A SUA ROTINA</span>
          <h1>{brand.tagline}</h1>
          <p>{brand.description}</p>
          <ul>
            <li>
              <Check />
              Sua agenda e seus clientes, juntos
            </li>
            {brand.hasPets && (
              <li>
                <Check />
                Cada pet com seu próprio cadastro
              </li>
            )}
            <li>
              <Check />
              Uma experiência simples, desde o início
            </li>
          </ul>
          <div className="auth-art">
            <CalendarDays size={38} />
            <div>
              <strong>Tempo para o que importa</strong>
              <span>Organizar. Atender. Cuidar.</span>
            </div>
            <Sparkles />
          </div>
        </div>
        <small>{brand.name} · Seu próximo atendimento começa aqui.</small>
      </section>
      <section className="auth-form">
        <div className="auth-mobile-logo">
          <Logo brand={brand} />
        </div>
        <div className="auth-form-inner">
          <p className="eyebrow">BEM-VINDO AO {brand.name.toUpperCase()}</p>
          <h2>
            {mode === "login"
              ? "Bom ter você por aqui."
              : "Seu espaço começa aqui."}
          </h2>
          <p>
            {mode === "login"
              ? "Entre para acompanhar sua agenda."
              : "Crie sua conta e organize o primeiro atendimento."}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <form onSubmit={submit}>
            {mode === "register" && (
              <>
                <Field label="Nome do estabelecimento">
                  <input
                    name="tenantName"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="organization"
                    placeholder={
                      brand.hasPets ? "Ex.: Pet Feliz" : "Nome do seu espaço"
                    }
                  />
                </Field>
                <Field label="Seu nome">
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="name"
                  />
                </Field>
              </>
            )}
            <Field label="E-mail">
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                maxLength={200}
                placeholder="voce@empresa.com.br"
              />
            </Field>
            <Field
              label={
                mode === "register"
                  ? "Senha (mínimo de 10 caracteres)"
                  : "Senha"
              }
            >
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "register" ? 10 : 1}
                maxLength={128}
              />
            </Field>
            <button className="primary" disabled={busy}>
              {busy
                ? "Preparando seu espaço…"
                : mode === "login"
                  ? "Entrar na minha agenda"
                  : "Criar meu espaço"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === "login" ? "Primeira vez por aqui?" : "Já tem uma conta?"}{" "}
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Criar conta" : "Entrar"}
            </button>
          </p>
          <p className="auth-note">
            <ShieldCheck size={16} />
            Acesso exclusivo ao seu estabelecimento.
          </p>
        </div>
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
