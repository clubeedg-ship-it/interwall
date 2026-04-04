# interwall

Direct local run path:

1. Start Docker Desktop.
2. Run `npm run local:up`
3. Open `http://localhost:3000`
4. Sign in with `demo@interwall.local` / `Demo123!`

What `npm run local:up` does:

- starts local Supabase with `npx supabase start`
- writes `apps/web/.env.local` and `apps/web/.env.docker.local`
- seeds a demo user, tenant, warehouse, product, stock lot, and sample orders
- starts the Next app in Docker Compose

Useful commands:

- `npm run local:up:host` runs the Next app on your host instead of in Docker
- `npm run local:prepare` only starts Supabase, writes env files, and seeds demo data
- `npm run local:down` stops the web container and local Supabase

After sign-in:

- `/workspace` shows the seeded wall shell
- `/orders` shows a seeded sales order with an intentional stock shortfall and a purchase order for receive/ship flow testing
