import { Navigate, Route, Routes } from "react-router-dom";
import Shell from "./components/Shell";
import LoginPage from "./pages/LoginPage";
import ViewStub from "./pages/ViewStub";
import BuildsPage from "./pages/BuildsPage";
import ProfitPage from "./pages/ProfitPage";
import ProfitInventoryPage from "./pages/ProfitInventoryPage";
import WallPage from "./pages/WallPage";
import CatalogPage from "./pages/CatalogPage";
import { useAuth } from "./lib/auth";
import { ALL_VIEWS, BUILDS, CATALOG, DEFAULT_VIEW, PROFIT, WALL } from "./config/views";

export default function App() {
  const { status } = useAuth();

  if (status === "checking") return <AppLoader />;
  if (status === "anonymous") return <LoginPage />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to={DEFAULT_VIEW.path} replace />} />
        {ALL_VIEWS.map((view) => {
          if (view.key === BUILDS.key) {
            return (
              <Route key={view.key}>
                <Route path={view.path} element={<BuildsPage />} />
                <Route
                  path={`${view.path}/:buildCode`}
                  element={<BuildsPage />}
                />
              </Route>
            );
          }
          if (view.key === WALL.key) {
            return <Route key={view.key} path={view.path} element={<WallPage />} />;
          }
          if (view.key === CATALOG.key) {
            return <Route key={view.key} path={view.path} element={<CatalogPage />} />;
          }
          if (view.key === PROFIT.key) {
            return (
              <Route key={view.key}>
                <Route path={view.path} element={<ProfitPage />} />
                <Route
                  path={`${view.path}/inventory`}
                  element={<ProfitInventoryPage />}
                />
              </Route>
            );
          }
          return <Route key={view.key} path={view.path} element={<ViewStub />} />;
        })}
        <Route path="*" element={<Navigate to={DEFAULT_VIEW.path} replace />} />
      </Route>
    </Routes>
  );
}

function AppLoader() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-[var(--color-accent)]" />
    </div>
  );
}
