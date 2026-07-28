import { useEffect } from "react";

export default function Wiki() {
    useEffect(() => {
        window.open(import.meta.env.VITE_URL_MZPEDIA);
    }, []);
    return null;
}