import { Component, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CustomerShell, OpsShell, ProviderShell, RequireRole } from "./components/Shells";
import { AccountPage, BookingDetailPage } from "./pages/Account";
import { BookPage } from "./pages/Book";
import { LoginPage } from "./pages/Login";
import { LandingPage, ServiceDetailPage, ServicesPage } from "./pages/Market";
import { AreasPage, CapacityPage, CatalogPage, DispatchPage, OpsBookingPage, OpsBookingsPage, OverviewPage, ProvidersPage } from "./pages/Ops";
import { AvailabilityPage, ProviderHome, ProviderJobPage } from "./pages/ProviderArea";
import { StoreProvider } from "./state/store";

export function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <AppErrorBoundary>
          <Routes>
            <Route element={<CustomerShell />}>
              <Route index element={<LandingPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="services/:serviceId" element={<ServiceDetailPage />} />
              <Route path="book/:serviceId" element={<BookPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="bookings/:bookingId" element={<BookingDetailPage />} />
              <Route path="login" element={<LoginPage />} />
            </Route>
            <Route
              path="provider"
              element={
                <RequireRole role="provider">
                  <ProviderShell />
                </RequireRole>
              }
            >
              <Route index element={<ProviderHome />} />
              <Route path="jobs/:bookingId" element={<ProviderJobPage />} />
              <Route path="availability" element={<AvailabilityPage />} />
            </Route>
            <Route
              path="ops"
              element={
                <RequireRole role="admin">
                  <OpsShell />
                </RequireRole>
              }
            >
              <Route index element={<OverviewPage />} />
              <Route path="areas" element={<AreasPage />} />
              <Route path="catalog" element={<CatalogPage />} />
              <Route path="dispatch" element={<DispatchPage />} />
              <Route path="capacity" element={<CapacityPage />} />
              <Route path="bookings" element={<OpsBookingsPage />} />
              <Route path="bookings/:bookingId" element={<OpsBookingPage />} />
              <Route path="providers" element={<ProvidersPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppErrorBoundary>
      </StoreProvider>
    </BrowserRouter>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  render() {
    if (this.state.message) {
      return (
        <main className="container page-block">
          <h1>Something went wrong</h1>
          <p>{this.state.message}</p>
          <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
