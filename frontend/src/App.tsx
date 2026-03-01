import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { TripProvider } from "./context/TripProviderComposed";
import { AuthGuard } from "./components/AuthGuard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import AuthPage from "./pages/Auth";

const ItineraryPage = lazy(() => import("./pages/Itinerary"));
const POIsPage = lazy(() => import("./pages/POIs"));
const TransportPage = lazy(() => import("./pages/Transport"));
const RecommendationsPage = lazy(() => import("./pages/Recommendations"));
const MapPage = lazy(() => import("./pages/Map"));
const BudgetPage = lazy(() => import("./pages/Budget"));
const TasksPage = lazy(() => import("./pages/Tasks"));
const InboxPage = lazy(() => import("./pages/Inbox"));
const AccommodationPage = lazy(() => import("./pages/Accommodation"));
const DndTestPage = lazy(() => import("./pages/DndTest"));
const ShareTargetPage = lazy(() => import("./pages/ShareTarget"));
const ContactsPage = lazy(() => import("./pages/Contacts"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin h-8 w-8" /></div>}>
            <Routes>
              <Route path="/auth" element={<ErrorBoundary><AuthPage /></ErrorBoundary>} />
              <Route path="/*" element={
                <AuthGuard>
                  <TripProvider>
                    <Routes>
                      <Route path="/" element={<ErrorBoundary><DndTestPage /></ErrorBoundary>} />
                      <Route path="/itinerary" element={<ErrorBoundary><ItineraryPage /></ErrorBoundary>} />
                      <Route path="/pois" element={<ErrorBoundary><POIsPage /></ErrorBoundary>} />
                      <Route path="/transport" element={<ErrorBoundary><TransportPage /></ErrorBoundary>} />
                      <Route path="/recommendations" element={<ErrorBoundary><RecommendationsPage /></ErrorBoundary>} />
                      <Route path="/map" element={<ErrorBoundary><MapPage /></ErrorBoundary>} />
                      <Route path="/budget" element={<ErrorBoundary><BudgetPage /></ErrorBoundary>} />
                      <Route path="/tasks" element={<ErrorBoundary><TasksPage /></ErrorBoundary>} />
                      <Route path="/inbox" element={<ErrorBoundary><InboxPage /></ErrorBoundary>} />
                      <Route path="/accommodation" element={<ErrorBoundary><AccommodationPage /></ErrorBoundary>} />
                      <Route path="/contacts" element={<ErrorBoundary><ContactsPage /></ErrorBoundary>} />
                      <Route path="/share-target" element={<ErrorBoundary><ShareTargetPage /></ErrorBoundary>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </TripProvider>
                </AuthGuard>
              } />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
