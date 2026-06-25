import { Navigate } from "react-router-dom";
import App from "./App";

import MinecraftServers from "./pages/MinecraftServers";
import Wiki from "./pages/Wiki";
import Main from "./pages/Main";
import UserManagement from "./pages/UserManagement";
import RequireAdmin from "./auth/RequireAdmin";

const material = (code) => {
    return <span className="material-icons">{code}</span>
}

export const pages = [
    {
        id: 'main',
        title: '메인',
        icon: material("home"),
        path: '/',
        element: <Main />,
    },
    {
        id: 'minecraft',
        title: '마인크래프트 서버',
        icon: material("view_in_ar"),
        path: '/minecraft',
        element: <MinecraftServers />,
    },
    {
        id: 'wiki',
        title: '마랜디위키',
        icon: material("book"),
        path: '/wiki',
        external: true,
        element: <Wiki />
    },
    {
        id: 'users',
        title: '유저 관리',
        icon: material("group"),
        path: '/users',
        adminOnly: true,
        element: <RequireAdmin><UserManagement /></RequireAdmin>,
    }
]

export const pagesByPath = Object.fromEntries(
    pages.map(page => [page.path, page])
)