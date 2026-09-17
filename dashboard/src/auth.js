/**
 * Comptes et sessions. Deux utilisateurs, mot de passe scrypt, cookie de
 * session opaque pointant sur une ligne de la table `sessions`.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";

const DUREE_SESSION_JOURS = 30;

// ── Mots de passe ──────────────────────────────────────────────────────────
export function hacher(mdp) {
  const sel = randomBytes(16).toString("hex");
  const hash = scryptSync(mdp, sel, 64).toString("hex");
  return `scrypt$${sel}$${hash}`;
}

export function verifier(mdp, stocke) {
  const [algo, sel, hash] = String(stocke).split("$");
  if (algo !== "scrypt" || !sel || !hash) return false;
  const candidat = scryptSync(mdp, sel, 64);
  const attendu = Buffer.from(hash, "hex");
  return candidat.length === attendu.length && timingSafeEqual(candidat, attendu);
}

// ── Comptes ────────────────────────────────────────────────────────────────
export function creerCompte(email, mdp) {
  db.prepare("INSERT INTO utilisateurs (email, mdp_hash) VALUES (?, ?)").run(email.trim().toLowerCase(), hacher(mdp));
}

/** Au premier démarrage, crée les comptes de COMPTES_INITIAUX si la table est vide. */
export function initialiserComptes() {
  if (SANS_CONNEXION) {
    console.warn("SANS_CONNEXION=1 : pas de page de connexion (mode développement)");
    return;
  }
  const n = db.prepare("SELECT COUNT(*) AS n FROM utilisateurs").get().n;
  if (n > 0) return;
  const liste = (process.env.COMPTES_INITIAUX || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (liste.length === 0) {
    console.warn("Aucun compte : définir COMPTES_INITIAUX (email:motdepasse,…) dans .env");
    return;
  }
  for (const item of liste) {
    const i = item.indexOf(":");
    if (i === -1) continue;
    creerCompte(item.slice(0, i), item.slice(i + 1));
    console.log(`· compte créé : ${item.slice(0, i)}`);
  }
}

export function authentifier(email, mdp) {
  const u = db.prepare("SELECT * FROM utilisateurs WHERE email = ?").get(String(email).trim().toLowerCase());
  if (!u || !verifier(mdp, u.mdp_hash)) return null;
  return u;
}

// ── Sessions ───────────────────────────────────────────────────────────────
export function ouvrirSession(res, utilisateurId) {
  const id = randomBytes(32).toString("base64url");
  const expire = new Date(Date.now() + DUREE_SESSION_JOURS * 86400e3);
  db.prepare("INSERT INTO sessions (id, utilisateur_id, expire_le) VALUES (?, ?, ?)").run(id, utilisateurId, expire.toISOString());
  res.cookie("session", id, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    expires: expire,
    path: "/",
  });
}

export function fermerSession(req, res) {
  if (req.cookies?.session) db.prepare("DELETE FROM sessions WHERE id = ?").run(req.cookies.session);
  res.clearCookie("session", { path: "/" });
}

// SANS_CONNEXION=1 : aucune page de connexion, tout le monde est « local ».
// Réservé au développement sur sa propre machine, jamais en production.
export const SANS_CONNEXION = process.env.SANS_CONNEXION === "1";

/** Middleware : pose req.utilisateur si le cookie correspond à une session valide. */
export function chargerUtilisateur(req, res, next) {
  req.utilisateur = null;
  if (SANS_CONNEXION) {
    req.utilisateur = { id: 0, email: "local" };
    res.locals.utilisateur = req.utilisateur;
    return next();
  }
  const id = req.cookies?.session;
  if (id) {
    const u = db
      .prepare(
        `SELECT u.id, u.email FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur_id
         WHERE s.id = ? AND s.expire_le > datetime('now')`
      )
      .get(id);
    if (u) req.utilisateur = u;
  }
  res.locals.utilisateur = req.utilisateur;
  next();
}

/** Middleware : redirige vers /connexion (ou 401 pour les appels API). */
export function exigerConnexion(req, res, next) {
  if (req.utilisateur) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ erreur: "Non connecté" });
  res.redirect("/connexion?suite=" + encodeURIComponent(req.originalUrl));
}

/**
 * Protection CSRF : les requêtes qui modifient quelque chose doivent venir de
 * notre propre origine. Le cookie SameSite=Strict fait déjà l'essentiel ; ce
 * contrôle couvre les navigateurs qui l'ignorent.
 */
export function verifierOrigine(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.path.startsWith("/webhooks/") || req.path.startsWith("/desabonnement/")) return next();
  const origine = req.get("origin") || (req.get("referer") ? new URL(req.get("referer")).origin : null);
  if (!origine) return next(); // formulaire soumis sans en-tête : rare, on laisse passer
  const attendu = `${req.protocol}://${req.get("host")}`;
  if (origine !== attendu) return res.status(403).send("Origine refusée");
  next();
}

// ── Anti-force brute sur la connexion ──────────────────────────────────────
const tentatives = new Map(); // ip → { n, depuis }
export function limiterConnexion(req, res, next) {
  const ip = req.ip;
  const t = tentatives.get(ip);
  const maintenant = Date.now();
  if (t && maintenant - t.depuis < 15 * 60e3 && t.n >= 10) {
    return res.status(429).render("connexion", { erreur: "Trop de tentatives. Réessayez dans un quart d'heure." });
  }
  next();
}
export function noterEchec(ip) {
  const t = tentatives.get(ip);
  const maintenant = Date.now();
  if (!t || maintenant - t.depuis > 15 * 60e3) tentatives.set(ip, { n: 1, depuis: maintenant });
  else t.n++;
}
export function oublierEchecs(ip) {
  tentatives.delete(ip);
}
