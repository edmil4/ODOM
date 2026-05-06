import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Mock robot state
  let leftTicks = 0;
  let rightTicks = 0;
  const MM_PER_TICK = (Math.PI * 140) / 1450;

  // Simulador avanzado: Ciclo "Girar -> Avanzar"
  let state = "ROTATING";
  let stateTimer = 0;

  setInterval(() => {
    if (state === "ROTATING") {
      // Girar en el lugar - Invertimos para que gire CCW (hacia +Y)
      leftTicks -= 0.5;
      rightTicks += 0.5;
      stateTimer++;
      if (stateTimer > 60) { // Girar por 3 segundos aprox
        state = "MOVING";
        stateTimer = 0;
      }
    } else {
      // Avanzar en línea recta
      leftTicks += 1.5;
      rightTicks += 1.5;
      stateTimer++;
      if (stateTimer > 80) { // Avanzar por 4 segundos aprox
        state = "ROTATING";
        stateTimer = 0;
      }
    }
  }, 50);

  const ticksHandler = (req: express.Request, res: express.Response) => {
    res.json({
      left: {
        ticks: Math.floor(leftTicks),
        distance_mm: leftTicks * MM_PER_TICK
      },
      right: {
        ticks: Math.floor(rightTicks),
        distance_mm: rightTicks * MM_PER_TICK
      }
    });
  };

  app.get("/api/ticks", ticksHandler);
  app.get("/ticks", ticksHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Ready at http://localhost:${PORT}`);
    console.log(`[SERVER] API endpoint available at http://localhost:${PORT}/api/ticks`);
  });
}

startServer();
