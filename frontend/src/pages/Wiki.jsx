import { useEffect } from "react";

export default function Wiki() {
    useEffect(() => {
        window.open("https://mzpedia.kro.kr/wiki/index.php/%EB%8C%80%EB%AC%B8");
    }, []);
    return null;
}