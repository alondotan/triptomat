import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TripProvider } from "./context/TripContext";
import { AuthGuard } from "./components/AuthGuard";
import AuthPage from "./pages/Auth";
import ItineraryPage from "./pages/Itinerary";
import POIsPage from "./pages/POIs";
import TransportPage from "./pages/Transport";
import RecommendationsPage from "./pages/Recommendations";
import MapPage from "./pages/Map";
import BudgetPage from "./pages/Budget";
import TasksPage from "./pages/Tasks";
import InboxPage from "./pages/Inbox";
import AccommodationPage from "./pages/Accommodation";
import DndTestPage from "./pages/DndTest";
import ShareTargetPage from "./pages/ShareTarget";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
                  <Route path="/share-target" element={<ShareTargetPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </TripProvider>
            </AuthGuard>
          } />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
