/**
 * Point d'entrée. Express 5, vues EJS, fichiers statiques dans src/public.
 */

import express from "express";
import cookieParser from "cookie-parser";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import "./db.js";
import { chargerUtilisateur, exigerConnexion, verifierOrigine, initialiserComptes } from "./auth.js";
import routesAuth from "./routes/auth.js";
import routesNewsletters from "./routes/newsletters.js";
import routesPublic from "./routes/public.js";
import routesReglages from "./routes/reglages.js";
import routesMedias from "./routes/medias.js";
import routesContacts from "./routes/contacts.js";
import routesEnvoi from "./routes/envoi.js";
import { demarrerBoucle } from "./envoi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.set("view engine", "ejs");
app.set("views", resolve(__dirname, "views"));
app.set("trust proxy", 1); // derrière Traefik (Coolify)
app.disable("x-powered-by");

app.use(express.urlencoded({ extended: false, limit: "2mb" }));
// Le webhook Resend signe le corps brut : il faut le garder tel quel pour
// pouvoir vérifier la signature.
app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(cookieParser());
app.use("/static", express.static(resolve(__dirname, "public"), { maxAge: "1h" }));

app.use(chargerUtilisateur);
app.use(verifierOrigine);

app.locals.PUBLIC_URL = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");

// Public
app.use(routesAuth);
app.use(routesPublic);

// Connecté
app.use(exigerConnexion);
app.use(routesNewsletters);
app.use(routesReglages);
app.use(routesMedias);
app.use(routesContacts);
app.use(routesEnvoi);

app.use((req, res) => res.status(404).render("erreur", { code: 404, message: "Page introuvable" }));
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith("/api/")) return res.status(500).json({ erreur: err.message });
  res.status(500).render("erreur", { code: 500, message: err.message });
});

initialiserComptes();
demarrerBoucle();

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Dashboard newsletter : http://localhost:${port}`));
