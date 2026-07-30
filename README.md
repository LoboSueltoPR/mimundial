# MiMundial

Tu registro de picaditos: quién juega, quién lleva invitados, quién debe plata y cómo salió.

Next.js 16 (App Router) + Supabase + Vercel. PWA instalable, lista para notificaciones push.

---

## Puesta en marcha

El código ya está andando; estos cuatro pasos son los que **solo vos** podés hacer porque
necesitan tus cuentas. Son unos 10 minutos.

### 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá un proyecto (región: **South America (São Paulo)**, la más cercana).
2. Cuando termine, andá a **Project Settings → API** y copiá:
   - **Project URL**
   - **anon public key**

### 2. Crear las tablas

En Supabase, **SQL Editor → New query**, pegá **todo** el contenido de
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) y dale **Run**.

Eso crea `perfiles`, `partidos` y `jugadores`, y **activa Row Level Security** con políticas para
que cada usuario vea solo lo suyo. No lo saltees: sin RLS, cualquiera con la anon key podría leer
los datos de todos.

### 3. Prender el login con Google

En Supabase → **Authentication → Providers → Google** → activalo.
Te va a pedir Client ID y Client Secret, que salen de
[Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
**Create credentials → OAuth client ID → Web application**.

Ahí pegá, tal cual:

| Campo | Valor |
| --- | --- |
| Authorized JavaScript origins | `https://<TU-PROYECTO>.supabase.co` |
| Authorized redirect URIs | `https://<TU-PROYECTO>.supabase.co/auth/v1/callback` |

Después, en Supabase → **Authentication → URL Configuration**:

| Campo | Valor |
| --- | --- |
| Site URL | `https://<TU-APP>.vercel.app` |
| Redirect URLs | `https://<TU-APP>.vercel.app/auth/callback` y `http://localhost:3001/auth/callback` |

> El login por mail (link mágico) anda sin configurar nada extra. Si por ahora te alcanza con eso,
> saltate este paso.

### 4. Correrlo local y después subirlo

```bash
cp .env.example .env.local
```

Completá `.env.local` con la URL y la anon key del paso 1, y:

```bash
npm install
npm run dev
```

Abrí http://localhost:3001

Para publicar: importá el repo en [vercel.com/new](https://vercel.com/new) y en
**Settings → Environment Variables** cargá las mismas dos variables
(`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Deploy y listo.

---

## Qué hace

- **Camino** — tu mundial personal. Cada triunfo te hace avanzar una instancia: fase de grupos (3),
  octavos, cuartos, semifinal, final. Siete al hilo y levantás la copa, que queda en la vitrina y
  arrancás un mundial nuevo. El empate te deja donde estabas; **la derrota te manda a cero**.
- **Partidos** — fecha, hora, lugar, cuántos van y cuánto sale.
- **Anotados** — sumás gente y le ponés `+` por cada invitado. El invitado ocupa lugar en el cupo y
  se le carga a la cuenta de quien lo trae.
- **Equipos** — sorteo aleatorio (Fisher-Yates) en claros y oscuros. Queda guardado y avisa si la
  lista cambió desde el último sorteo.
- **Plata** — se divide por cabeza, no por persona. El que adelanta la plata queda saldado y el
  resto le debe a él.
- **Resultado** — ganamos / empate / perdimos, con marcador opcional. Si cargás el marcador y no
  elegiste nada, el resultado se deduce solo.
- **Stats** — efectividad, racha, goles y quiénes enganchan siempre.
- **Cuentas** — saldo acumulado por persona a través de todos los partidos.
- **Importar** — subís el JSON de la app local *Se Juega* y se carga todo.

## Estructura

```
app/
  (app)/          pantallas con sesión: partidos, stats, cuentas, perfil
  login/          Google + link por mail
  auth/callback/  vuelta del OAuth
lib/
  calculos.ts     plata, equipos y stats (con tests)
  supabase/       clientes de navegador y servidor
proxy.ts          refresca la sesión y protege las rutas
supabase/migrations/  el SQL a pegar en Supabase
scripts/          generador de íconos y tests
```

> En Next.js 16 `middleware.ts` pasó a llamarse `proxy.ts`. Por eso el archivo tiene ese nombre.

## Comandos

```bash
npm run dev      # desarrollo en el puerto 3001
npm run build    # build de producción
npm test         # tests de la lógica de plata, equipos y stats
npm run iconos   # regenera los PNG del ícono
```

## PWA y notificaciones

Ya están el `manifest.json`, los íconos y el service worker (`public/sw.js`), que cachea el shell
para que la app abra sin señal. El handler de `push` también está escrito.

Lo que **falta** para tener notificaciones de verdad: generar las claves VAPID, guardar las
suscripciones en una tabla y un endpoint que las dispare. En iPhone, además, la app tiene que estar
agregada a la pantalla de inicio: si no, iOS no entrega push.

## Ideas para después

Ordenadas por si tocan la base de datos o no.

**Necesitan cambiar el esquema** (conviene decidirlas antes):

- **Grupos compartidos** — que la pachanguita entera vea el mismo partido y cada uno se anote solo.
  La tabla `partidos` ya tiene un `grupo_id` sin usar, justamente para esto.
- **Link para anotarse** — compartís una URL y el que entra se suma sin instalar nada.
- **Canchas guardadas** — sedes y precios que ya usás, para no reescribirlos cada vez.
- **Rendimiento por jugador** — con qué equipo ganó cada uno, quién nunca pierde.

**No tocan el esquema, se pueden agregar cuando sea:**

- Repetir el último partido con un toque (mismo lugar, misma gente).
- Recordatorio de cobro a los que deben.
- Sortear equipos evitando que dos siempre caigan juntos.
- Exportar la lista lista para pegar en WhatsApp.
- Modo claro.

## Licencia

MIT
