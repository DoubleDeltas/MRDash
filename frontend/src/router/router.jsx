import { createBrowserRouter } from 'react-router-dom'
import App from '../App'
import Main from '../pages/Main'
import MinecraftServers from '../pages/MinecraftServers'
import ServerConsole from '../pages/ServerConsole'
import Login from '../pages/Login'
import { pages } from '../pageConstants'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />
  },
  {
    path: '/',
    element: <App />,
    children: [
      ...pages
        .filter(page => !page.main)
        .map(({path, element}) => ({path, element})),
      {
        path: '/console/:serverId',
        element: <ServerConsole />
      }
    ]
  }
])