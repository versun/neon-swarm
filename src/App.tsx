import { Routes, Route } from "react-router";
import Navbar from "@/components/Navbar";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Game from "@/pages/Game";

export default function App() {
  return (
    <>
      {/* Navbar renders once and self-collapses into the stealth combat nav on /game */}
      <Navbar />
      <Routes>
        {/* Full-viewport game route: no Layout chrome, no footer */}
        <Route path="/game" element={<Game />} />
        {/* Standard pages share nav offset + footer via the nested-route layout */}
        <Route element={<Layout />}>
          <Route index element={<Home />} />
        </Route>
      </Routes>
    </>
  );
}
