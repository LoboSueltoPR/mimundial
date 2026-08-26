# MiMundial

Tu registro de picaditos: quién juega, quién lleva invitados, quién debe plata y cómo salió.

Next.js 16 (App Router) + Supabase + Vercel. PWA instalable, lista para notificaciones push.

---


## Qué hace

- **Camino** — tu mundial personal. Cada triunfo te hace avanzar una instancia: fase de grupos (3),
  octavos, cuartos, semifinal, final. Siete al hilo y levantás la copa, que queda en la vitrina y
  arrancás un mundial nuevo. El empate te deja donde estabas; **la derrota te manda a cero**.
- **Invitar sin cuenta** — cada partido tiene un link. El que lo abre pone su nombre y se anota, sin
  registrarse. Solo puede manejar su lugar y sus invitados. Desde el link también ve **los equipos**
  ya sorteados y **la plata**: cuánto salió, cuánto es por cabeza, a quién hay que pagarle y cuánto
  le toca a él. Lo que debe cada uno de los demás **no** se muestra: no es dato para colgar de un
  link que circula por el grupo.
- **La placa** — la convocatoria como imagen de 1080×1920, lista para una historia. Se genera en el
  navegador con canvas. Ojo: Instagram no recibe posteos desde una web, así que lo único que se
  puede hacer es pasarle el archivo al menú de compartir del celular; en compu se baja.
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
