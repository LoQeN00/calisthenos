# prototype/ — oryginalny prototyp (TYLKO referencja)

Jednostronicowy prototyp React-on-Babel, z którego wywodzi się produkcyjna
aplikacja w [`../app/`](../app/README.md). **To materiał referencyjny — nie jest
budowany ani importowany przez aplikację.** Zachowany, dopóki nowa apka nie
osiągnie pełnej parzystości funkcji; potem do archiwizacji/usunięcia (patrz spec
§13). Logikę portuje się stąd do server-akcji/repozytoriów, nie odwrotnie.

| Plik | Rola w prototypie |
|---|---|
| `index.html` / `kalisthenos.html` | Punkt wejścia SPA (self-unpacking). |
| `app.jsx` | Root aplikacji / routing widoków. |
| `store.jsx` | Stan + logika (m.in. `savePlan`, `publishPlan` — wzorzec wersjonowania planów). |
| `data.jsx` | Dane seed (ćwiczenia, plany, logi). |
| `trainer-views.jsx` | Widoki trenera. |
| `trainer-plan-editor.jsx` | Edytor planów (wzorzec dla `routes/trener/plany.$planId.tsx`). |
| `trainee-views.jsx` | Widoki podopiecznego. |
| `body-views.jsx` | Widoki sylwetki. |
| `ui.jsx` | Komponenty UI (źródło dla `app/components/`). |
| `icons.jsx` | Zestaw ikon (źródło dla `app/components/icons.tsx`). |
| `tweaks-panel.jsx` | Panel motywu/akcentu (localStorage — zastąpiony preferencją usera). |
| `styles.css` | Style (źródło tokenów dla `app/styles/tokens.css`). |

---
Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
