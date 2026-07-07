import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "./pages/Home";
import Movies from "./pages/Movies";
import TVShows from "./pages/TVShows";
import Anime from "./pages/Anime";
import AnimeDetails from "./pages/AnimeDetails";
import MovieDetails from "./pages/MovieDetails";
import TVShowDetails from "./pages/TVShowDetails";
import SearchPage from "./pages/SearchPage";
import MyList from "./pages/MyList";
import Downloads from "./pages/Downloads";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import BottomNav from "./components/BottomNav";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movies" element={<Movies />} />
          <Route path="/tv-shows" element={<TVShows />} />
          <Route path="/anime" element={<Anime />} />
          <Route path="/anime/:id" element={<AnimeDetails />} />
          <Route path="/movie/:id" element={<MovieDetails />} />
          <Route path="/tv/:id" element={<TVShowDetails />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/my-list" element={<MyList />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <BottomNav />
        <PWAInstallPrompt />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
