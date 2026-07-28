import { useEffect } from "react";

export default function Wiki() {
    useEffect(() => {
        window.open(window.__env?.VITE_URL_MZPEDIA);
    }, []);
    return null;
}