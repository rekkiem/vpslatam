# 🚀 VPS LATAM Cloud

Plataforma SaaS para desplegar aplicaciones desde GitHub en un clic. Arquitectura similar a Render/Railway, optimizada para LATAM, corriendo en un solo VPS de USD 20-40/mes.

---

## 📐 Arquitectura general

```
Internet
    │
    ▼
 Traefik (80/443) ─── Let's Encrypt SSL automático
    │
    ├── app.vpslatam.cloud  ──► Web (React SPA, nginx)
    ├── api.vpslatam.cloud  ──► API (Fastify + pg-boss)
    ├── <slug>.vpslatam.cloud ► Contenedores de usuarios
    └── traefik.vpslatam.cloud ► Dashboard Traefik
    │
    └── [internal network]
           ├── PostgreSQL 15
           └── Registry local Docker
```

**Stack completo:**

| Capa | Tecnología |
|------|-----------|
| Frontend | Vite + React 18 + TanStack Router + Tailwind CSS |
| Backend | Fastify 4 + TypeScript |
| Base de datos | PostgreSQL 15 con Prisma ORM |
| Colas | pg-boss (sobre PostgreSQL, sin Redis) |
| Proxy / SSL | Traefik v3 + Let's Encrypt |
| Build engine | Docker SDK (dockerode) |
| Auth | JWT + Refresh tokens + GitHub OAuth |
| Billing | Stripe Checkout + portal de cliente |
| Monorepo | pnpm workspaces |

---

## 📁 Estructura de carpetas

```
vpslatam/
├── apps/
│   ├── api/                    # Fastify backend
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point
│   │   │   ├── config.ts       # Env vars con validación Zod
│   │   │   ├── lib/
│   │   │   │   ├── prisma.ts   # Singleton Prisma
│   │   │   │   └── crypto.ts   # AES-256-GCM para env vars
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts     # JWT middleware
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts     # Register/login/GitHub OAuth
│   │   │   │   ├── projects.ts # CRUD proyectos + env vars
│   │   │   │   ├── deployments.ts # Deploy + logs + rollback
│   │   │   │   ├── webhooks.ts # GitHub push + Stripe
│   │   │   │   ├── admin.ts    # Panel admin
│   │   │   │   ├── billing.ts  # Stripe checkout
│   │   │   │   └── domains.ts  # Dominios custom
│   │   │   ├── queues/
│   │   │   │   ├── boss.ts     # pg-boss singleton
│   │   │   │   └── deploy-queue.ts # Worker de deploy
│   │   │   └── services/
│   │   │       ├── detect-framework.ts # Auto-detecta stack
│   │   │       ├── metrics.ts  # Colector Docker stats
│   │   │       └── audit.ts    # Audit log helper
│   │   ├── Dockerfile
│   │   └── entrypoint.sh       # migrate + start
│   │
│   └── web/                    # React SPA
│       ├── src/
│       │   ├── main.tsx        # Router + providers
│       │   ├── App.tsx         # Layout + sidebar
│       │   ├── lib/api.ts      # Cliente HTTP tipado
│       │   ├── store/auth.ts   # Zustand auth store
│       │   └── pages/
│       │       ├── Login.tsx   # Login + registro
│       │       ├── Dashboard.tsx # Lista de proyectos
│       │       ├── NewProject.tsx # Selector GitHub + config
│       │       ├── Project.tsx  # Detalle: deploys/logs/métricas
│       │       ├── Billing.tsx  # Planes + facturas
│       │       └── Admin.tsx    # Panel admin
│       ├── Dockerfile
│       └── nginx.conf
│
├── packages/
│   └── shared/
│       └── schemas/project.schema.ts  # Zod schemas compartidos
│
├── prisma/
│   └── schema.prisma           # Schema completo DB
│
├── infra/
│   └── traefik/
│       └── dynamic.yml         # Middlewares Traefik
│
├── scripts/
│   └── deploy-production.sh    # Script de deploy VPS
│
├── docker-compose.yml
├── .env.example
└── pnpm-workspace.yaml
```

---

## ⚡ Inicio rápido (desarrollo local)

### Prerequisitos
- Node.js 20+
- pnpm 9+
- Docker + Docker Compose
- Git

### 1. Clonar e instalar

```bash
git clone https://github.com/tu-usuario/vpslatam.git
cd vpslatam
pnpm install
```

### 2. Configurar entorno

```bash
cp .env.example .env
```

Edita `.env` con los valores mínimos para desarrollo:

```env
NODE_ENV=development
DATABASE_URL=postgresql://vpslatam:password@localhost:5432/vpslatam
JWT_SECRET=desarrollo_secret_32_caracteres_minimo_aqui
JWT_REFRESH_SECRET=desarrollo_refresh_32_caracteres_minimo_aqui
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
GITHUB_CLIENT_ID=tu_github_client_id
GITHUB_CLIENT_SECRET=tu_github_client_secret
GITHUB_WEBHOOK_SECRET=cualquier_string_random
FRONTEND_URL=http://localhost:5173
API_URL=http://localhost:4000
BASE_DOMAIN=localhost
```

### 3. Levantar PostgreSQL local

```bash
docker compose up postgres -d
```

### 4. Migrar base de datos

```bash
pnpm db:generate
pnpm db:migrate
```

### 5. Iniciar en modo desarrollo

```bash
pnpm dev
# API: http://localhost:4000
# Web: http://localhost:5173
# Docs: http://localhost:4000/docs
```

---

## 🌐 Deploy en producción (VPS)

### 1. Crear el VPS

**Recomendado: Hetzner CPX21** (~€7.49/mes)
- 3 vCPU AMD, 4 GB RAM, 80 GB SSD
- Imagen: Ubuntu 22.04 LTS

**Alternativa para más carga: Hetzner CPX31** (~€13.09/mes)
- 4 vCPU, 8 GB RAM, 160 GB SSD
- Soporta ~50 contenedores de usuarios simultáneos

También válido: Contabo VPS S, OVH Starter, DigitalOcean Basic.

### 2. Configurar DNS

En tu proveedor DNS, apunta estos registros a la IP del VPS:

```
A    @              → IP_DEL_VPS
A    www            → IP_DEL_VPS
A    api            → IP_DEL_VPS
A    traefik        → IP_DEL_VPS
A    *              → IP_DEL_VPS   ← wildcard para subdominios de usuarios
```

El wildcard `*.vpslatam.cloud` es esencial para que cada app tenga su subdominio automático.

### 3. Preparar el servidor

```bash
ssh root@IP_DEL_VPS

# Actualizar sistema
apt update && apt upgrade -y

# Crear directorio de configuración
mkdir -p /opt/vpslatam
```

### 4. Configurar variables de entorno

```bash
# En tu máquina local, genera los secrets:
openssl rand -hex 32   # para JWT_SECRET
openssl rand -hex 32   # para JWT_REFRESH_SECRET
openssl rand -hex 32   # para ENCRYPTION_KEY (exactamente 64 chars)

# Genera password de Traefik:
apt install apache2-utils -y
htpasswd -nb admin TU_PASSWORD_SEGURA

# En el VPS:
nano /opt/vpslatam/.env
```

Completa todos los campos de `.env.example`. Los mínimos obligatorios son:

```env
BASE_DOMAIN=vpslatam.cloud
ACME_EMAIL=tu@email.com
POSTGRES_PASSWORD=password_muy_seguro_32chars
JWT_SECRET=hex_64_chars
JWT_REFRESH_SECRET=hex_64_chars_diferente
ENCRYPTION_KEY=hex_64_chars_diferente
GITHUB_CLIENT_ID=Iv1.xxxxx
GITHUB_CLIENT_SECRET=xxxxx
GITHUB_WEBHOOK_SECRET=xxxxx
TRAEFIK_DASHBOARD_AUTH=admin:$apr1$...
REPO_URL=https://github.com/tu-usuario/vpslatam.git
```

### 5. Ejecutar el script de deploy

```bash
# Copiar el script al VPS
scp scripts/deploy-production.sh root@IP_DEL_VPS:/tmp/

# En el VPS:
bash /tmp/deploy-production.sh
```

El script:
1. Instala Docker si no está presente
2. Configura UFW (firewall)
3. Crea la red `traefik-net`
4. Clona el repositorio
5. Construye las imágenes
6. Levanta todos los servicios
7. Corre las migraciones
8. Configura logrotate y cron de auto-update

### 6. Crear GitHub OAuth App

1. Ve a https://github.com/settings/applications/new
2. **Application name:** VPS LATAM Cloud
3. **Homepage URL:** `https://vpslatam.cloud`
4. **Authorization callback URL:** `https://api.vpslatam.cloud/api/auth/github/callback`
5. Copia el **Client ID** y **Client Secret** al `.env`

### 7. Primer deploy de prueba

1. Abre `https://vpslatam.cloud`
2. Crea una cuenta con email/password o GitHub OAuth
3. Click en **"Nuevo proyecto"**
4. Selecciona un repositorio público de GitHub (ej: un proyecto Express simple)
5. Configura el puerto (ej: 3000) y click **"Crear y desplegar"**
6. Observa los logs en tiempo real
7. Tu app estará en `https://nombre-proyecto.vpslatam.cloud` ✅

---

## 🔧 Operaciones comunes

### Ver logs en tiempo real
```bash
# API
docker compose logs -f api

# Worker de deploys
docker compose logs -f api | grep "deploy"

# App de usuario específica
docker logs vpslatam-mi-proyecto -f
```

### Escalar / reiniciar API
```bash
docker compose restart api
```

### Backup de base de datos
```bash
docker exec vpslatam-postgres pg_dump -U vpslatam vpslatam | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restaurar backup
```bash
gunzip -c backup_20240101.sql.gz | docker exec -i vpslatam-postgres psql -U vpslatam vpslatam
```

### Ver contenedores de usuarios activos
```bash
docker ps --filter "label=vpslatam.project" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Limpiar imágenes y builds antiguos
```bash
docker image prune -af --filter "label=vpslatam.project"
rm -rf /var/vpslatam/builds/*
```

### Crear usuario admin manualmente
```bash
docker exec -it vpslatam-postgres psql -U vpslatam vpslatam -c \
  "UPDATE \"User\" SET role='SUPER_ADMIN' WHERE email='tu@email.com';"
```

---

## 📊 Monitoreo

### Health check API
```bash
curl https://api.vpslatam.cloud/health
```

### Recursos del sistema
```bash
# CPU y RAM por contenedor
docker stats --no-stream

# Espacio en disco
df -h /var/vpslatam
du -sh /var/vpslatam/builds /var/vpslatam/logs
```

### Traefik Dashboard
Accede a `https://traefik.vpslatam.cloud` con las credenciales del `.env`.

---

## 🔐 Seguridad

- **Env vars de usuarios:** Encriptadas con AES-256-GCM en la base de datos
- **JWT:** Access tokens de 15min + Refresh tokens rotativos de 30 días
- **Rate limiting:** 100 req/min por IP (configurable por ruta)
- **Recursos:** Cada contenedor de usuario tiene límites de CPU y RAM vía Docker
- **Red:** Contenedores de usuarios solo en `traefik-net`, aislados de la red interna
- **Firewall:** UFW permite solo 22, 80, 443
- **Passwords:** bcrypt con factor 12
- **Webhooks GitHub:** Verificación de firma HMAC-SHA256
- **Webhooks Stripe:** Verificación de firma oficial
- **SQL:** Prisma previene inyecciones con queries parametrizadas
- **Headers:** Helmet + CORS restrictivo a dominios propios

---

## 💰 Estimación de costos operativos

| Componente | Costo/mes |
|------------|-----------|
| VPS Hetzner CPX21 | €7.49 |
| Dominio .cloud | ~$12/año = $1/mes |
| Resend emails | Gratis (3000/mes) |
| Stripe | 2.9% + $0.30 por transacción |
| **Total fijo** | **~$10/mes** |

Con 10 clientes en plan Starter ($5/mes): **$50 MRR → $40 ganancia neta**.
Break-even a partir de 3 clientes pagos.

---

## 🗺️ Roadmap post-MVP

### Fase 1 — Pulido (semanas 3-4)
- [ ] Notificaciones por email (deploy success/failed) con Resend
- [ ] Dominio custom verificación por CNAME (UI mejorada)
- [ ] Variables de entorno en UI (crear/editar/eliminar inline)
- [ ] Preview deployments (branch distinto al principal)
- [ ] Soporte Mercado Pago para CLP/ARS/BRL
- [ ] Página de status pública (uptime por proyecto)

### Fase 2 — Escalabilidad horizontal (mes 2-3)
- [ ] **Múltiples nodos:** Migrar de un VPS a múltiples con Docker Swarm
  - Un nodo "manager" para la API y BD
  - N nodos "worker" para los contenedores de usuarios
  - Registro Docker distribuido (o Cloudflare R2 como registry)
- [ ] **Base de datos:** Replica de lectura + pgBouncer para pooling
- [ ] **Redis opcional:** Para sesiones distribuidas y pub/sub de logs en tiempo real
- [ ] **CDN:** Cloudflare delante del frontend (Free tier)
- [ ] Soporte para **monorepos** (detección de múltiples apps)

### Fase 3 — Kubernetes / k3s (mes 4-6)
- [ ] Migrar orquestación de Docker Compose → **k3s** (Kubernetes ligero)
  - Mantiene la misma API, solo cambia el runtime
  - Deployments como Kubernetes Deployments en namespace por usuario
  - HPA (Horizontal Pod Autoscaler) basado en CPU/RAM
- [ ] **cert-manager** reemplaza Traefik Let's Encrypt
- [ ] **Longhorn** para storage persistente replicado
- [ ] **Helm charts** para instalar en cualquier cloud

### Fase 4 — Observabilidad completa (mes 5+)
- [ ] **Loki + Grafana** para logs centralizados (reemplaza archivos planos)
- [ ] **Prometheus + node-exporter** para métricas del sistema
- [ ] **Alertmanager** → alertas Slack/email/WhatsApp cuando app cae
- [ ] **Sentry** para errores del frontend y API
- [ ] **Uptime Kuma** para monitoreo externo con página de status

### Fase 5 — Features premium
- [ ] **Bases de datos gestionadas:** PostgreSQL, MySQL, Redis one-click
- [ ] **Cron jobs:** Tareas programadas integradas en el panel
- [ ] **Funciones serverless** (estilo Vercel Edge Functions, con Deno)
- [ ] **Colaboración en equipo:** Invitaciones, roles, audit logs por equipo
- [ ] **Git branches como ambientes:** staging/prod automático
- [ ] **API pública** con tokens de API para CI/CD externo
- [ ] **CLI:** `vpslatam deploy` desde la terminal
- [ ] **Expansión regional:** Nodos en São Paulo, Buenos Aires, México DF
- [ ] **Marketplace:** Templates pre-configurados (WordPress, Strapi, n8n)

### Decisiones de arquitectura para V2

**¿Cuándo migrar de Docker Compose a k3s?**
A partir de ~200 usuarios activos o cuando necesites más de 2 nodos.
La API no cambia: el worker de deploy simplemente crea un `Pod` en lugar de un `Container`.

**¿Cuándo añadir Prometheus/Grafana?**
Cuando tengas 50+ proyectos activos y necesites dashboards agregados.
El endpoint `/health` + métricas básicas son suficientes para MVP.

**¿Redis o seguir con pg-boss?**
pg-boss es suficiente para ~1000 deploys/día en un VPS de 4 vCPU.
Redis agrega valor cuando necesitas pub/sub para logs en tiempo real a escala.

---

## 🐛 Troubleshooting

### El deploy falla con "Git clone failed"
→ Verifica que el GitHub OAuth token no haya expirado. El usuario debe re-conectar GitHub en Ajustes.

### SSL no se emite
→ Asegúrate que el DNS esté propagado (`dig A tu-proyecto.vpslatam.cloud`).
→ Traefik necesita el puerto 80 accesible para el challenge de Let's Encrypt.

### "Plan FREE allows max 1 project"
→ El usuario tiene un proyecto activo. Debe eliminarlo o actualizarse.

### Contenedor no aparece en Traefik
→ Verifica que el contenedor esté en la red `traefik-net`:
```bash
docker inspect vpslatam-mi-proyecto | grep traefik-net
```

### API no conecta a PostgreSQL
```bash
docker compose logs postgres
docker compose exec api sh -c "nc -zv postgres 5432"
```

### Ver todos los logs de un deploy
```bash
cat /var/vpslatam/logs/<deployment-id>.log
```

---

## 📬 Contacto y contribuciones

Pull requests bienvenidos. Para bugs críticos de seguridad, contactar directamente.

**Licencia:** MIT

---

*Construido con ❤️ para LATAM. Desplegado en un VPS de 8 euros al mes.*
