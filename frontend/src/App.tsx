import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { TripProvider } from "./context/TripProviderComposed";
import { AuthGuard } from "./components/AuthGuard";
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
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin h-8 w-8" /></div>}>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/*" element={
              <AuthGuard>
                <TripProvider>
                  <Routes>
                    <Route path="/" element={<DndTestPage />} />
                    <Route path="/itinerary" element={<ItineraryPage />} />
                    <Route path="/pois" element={<POIsPage />} />
                    <Route path="/transport" element={<TransportPage />} />
                    <Route path="/recommendations" element={<RecommendationsPage />} />
                    <Route path="/map" element={<MapPage />} />
                    <Route path="/budget" element={<BudgetPage />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/inbox" element={<InboxPage />} />
                    <Route path="/accommodation" element={<AccommodationPage />} />
                    <Route path="/contacts" element={<ContactsPage />} />
                    <Route path="/share-target" element={<ShareTargetPage />} />
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
);

export default App;
