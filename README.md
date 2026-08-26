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

Es la única forma de entrar, así que este paso **no se puede saltear**.

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
- **Invitar sin cuenta** — cada partido tiene un link. El que lo abre pone su nombre y se anota, sin registrarse. Solo puede manejar su lugar y sus invitados.
- **Amigos** — los sumás por mail y después los anotás de un toque. Los amigos de tus amigos aparecen sugeridos.
- **Partidos** — fecha, hora, lugar, cuántos van y cuánto sale.
- **Anotados** — sumás gente y le ponés `+` por cada invitado. El invitado ocupa lugar en el cupo y
  se le carga a la cuenta de quien lo trae.
- **Equipos** — sorteo aleatorio (Fisher-Yates) en claros y oscuros. Después se emparejan a mano:
  tocás un nombre para agarrarlo y lo pasás al otro equipo o lo cambiás por alguien de enfrente.
  Queda guardado y avisa si la lista cambió desde el último sorteo.
- **Plata** — se divide por cabeza, no por persona. El que adelanta la plata queda saldado y el
  resto le debe a él.
- **Resultado** — ganamos / empate / perdimos, con marcador opcional. Si cargás el marcador y no
  elegiste nada, el resultado se deduce solo. Con equipos sorteados se carga además **qué equipo
  ganó**, y ese dato sí es objetivo: a cada uno de los que jugaron le llega a su propio camino,
  ganado o perdido según de qué lado estuvo. Para eso cada anotado tiene que estar enganchado a su
  cuenta — los que cargaste a mano se marcan en **Anotados → Quién es quién**, y el que abre el
  link puede reclamar su fila con **"Ese soy yo"**.
- **Stats** — efectividad, racha, goles y quiénes enganchan siempre.
- **Cuentas** — saldo acumulado por persona a través de todos los partidos.

## Estructura

```
app/
  (app)/          pantallas con sesión: partidos, stats, cuentas, perfil
  p/[token]/      la invitación pública: entra cualquiera, sin cuenta
  login/          entrar con Google
  auth/callback/  vuelta del OAuth
lib/
  calculos.ts     plata, equipos y stats (con tests)
  supabase/       clientes de navegador y servidor
proxy.ts          refresca la sesión y protege las rutas
supabase/migrations/  el SQL a pegar en Supabase (0001 base, 0002 amigos e invitados,
                      0014 el resultado por equipo)
scripts/          generador de íconos y tests
```

> En Next.js 16 `middleware.ts` pasó a llamarse `proxy.ts`. Por eso el archivo tiene ese nombre.

## Comandos

```bash
npm run dev      # desarrollo en el puerto 3001
npm run build    # build de producción
npm test         # lógica de plata, equipos, stats y camino
node scripts/probar-seguridad.mjs [token]   # que el acceso anónimo esté realmente cerrado
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
- **Canchas guardadas** — sedes y precios que ya usás, para no reescribirlos cada vez.
- **Rendimiento por jugador** — con qué equipo ganó cada uno, quién nunca pierde.

**No tocan el esquema, se pueden agregar cuando sea:**

- Repetir el último partido con un toque (mismo lugar, misma gente).
- Recordatorio de cobro a los que deben.
- Sortear equipos evitando que dos siempre caigan juntos.
- Dar vuelta el resultado de los partidos viejos (los de antes de `equipo_ganador` no cuentan
  para el camino de los demás, y no hay de dónde deducir de qué lado jugó cada uno).
- Exportar la lista lista para pegar en WhatsApp.
- Modo claro.

## Licencia

MIT
