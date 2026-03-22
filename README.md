# RR.HH. Intelligence — Sistema de Reclutamiento

## Estructura del proyecto

```
rrhh-sistema/
├── backend/
│   ├── src/
│   │   ├── index.js          ← Servidor Express principal
│   │   ├── models/
│   │   │   ├── Vacante.js    ← Modelo MongoDB para vacantes
│   │   │   └── Postulante.js ← Modelo MongoDB para postulantes
│   │   └── routes/
│   │       ├── vacantes.js   ← CRUD de vacantes
│   │       ├── postulantes.js← Guardar respuestas
│   │       └── ranking.js    ← Análisis con Gemini IA
│   ├── package.json
│   └── .env.example          ← Copiá esto como .env
└── frontend/
    └── rrhh-sistema.html     ← Interfaz del reclutador
```

---

## Paso 1 — Crear la base de datos en MongoDB Atlas

1. Entrá a https://cloud.mongodb.com y creá una cuenta gratuita
2. Creá un **nuevo cluster** (elegí el plan M0 FREE)
3. En **Database Access** → creá un usuario con contraseña
4. En **Network Access** → agregá tu IP (o `0.0.0.0/0` para pruebas)
5. En tu cluster → **Connect** → **Drivers** → copiá la connection string

   Se ve así:
   ```
   mongodb+srv://tuusuario:tupassword@cluster0.xxxxx.mongodb.net/
   ```

---

## Paso 2 — Configurar el backend

```bash
# Entrar a la carpeta del backend
cd backend

# Instalar dependencias
npm install

# Copiar el archivo de configuración
cp .env.example .env
```

Ahora abrí el archivo `.env` y completá estos valores:

```env
MONGODB_URI=mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/rrhh_sistema?retryWrites=true&w=majority
PORT=3000
GEMINI_API_KEY=AIzaSy...tu_key_aqui
FRONTEND_URL=*
```

Para obtener tu API Key de Gemini:
→ https://aistudio.google.com/app/apikey (es gratis)

---

## Paso 3 — Iniciar el servidor

```bash
# Modo desarrollo (se reinicia automáticamente con cambios)
npm run dev

# O modo producción
npm start
```

Deberías ver:
```
✅ MongoDB Atlas conectado
🚀 Servidor corriendo en http://localhost:3000
```

Verificá que funcione:
→ http://localhost:3000/api/health

---

## Paso 4 — Abrir el frontend

Abrí el archivo `frontend/rrhh-sistema.html` en tu navegador.

Si el backend está corriendo, vas a ver el indicador **"API conectada"** en el sidebar.

> **Nota:** Si abrís el HTML directo desde el explorador de archivos (`file://`), 
> asegurate de tener `FRONTEND_URL=*` en el `.env`.
>
> Para mejor experiencia, podés usar la extensión **Live Server** de VS Code
> y abrir el HTML desde ahí (http://localhost:5500).

---

## Cómo usar el sistema

### El reclutador:
1. **Nueva Vacante** → completar nombre, área, descripción y requisitos clave
2. **Crear Cuestionario** → agregar preguntas personalizadas para esa vacante
3. **Ver Enlace** → copiar el link único y enviárselo al postulante

### El postulante:
- Abre el link y ve el formulario de esa vacante
- Completa sus respuestas
- Hace clic en "Enviar Postulación" → se guarda en MongoDB

### El análisis IA:
1. Ir a **Ranking IA** en el sidebar
2. Seleccionar la vacante
3. Hacer clic en **Analizar con Gemini**
4. Ver el ranking con puntajes, evaluaciones, fortalezas y debilidades

---

## API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/health` | Estado del servidor y DB |
| GET | `/api/vacantes` | Listar vacantes |
| POST | `/api/vacantes` | Crear vacante |
| GET | `/api/vacantes/:id` | Obtener vacante con cuestionario |
| PUT | `/api/vacantes/:id/cuestionario` | Guardar cuestionario |
| GET | `/api/postulantes` | Listar postulantes |
| POST | `/api/postulantes` | Guardar respuestas |
| POST | `/api/ranking/:vacanteId` | Generar ranking con Gemini |

---

## Próximos pasos (cuando quieras mejorar)

- [ ] Autenticación con JWT para el panel del reclutador
- [ ] Emails automáticos al postulante con confirmación
- [ ] Export del ranking a PDF
- [ ] Deploy en Railway o Render (gratis)
- [ ] Dashboard con gráficos de métricas
