import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import ProtectedRoute from './ProtectedRoute';
import ErrorPage from '../pages/ErrorPage';

/**
 * Every page is code-split. Home is the only route most visitors need on first
 * paint; everything else downloads when it is actually navigated to.
 */
const Home = lazy(() => import('../pages/Home'));
const ProductList = lazy(() => import('../pages/ProductList'));
const ProductDetails = lazy(() => import('../pages/ProductDetails'));
const Cart = lazy(() => import('../pages/Cart'));
const Checkout = lazy(() => import('../pages/Checkout'));
const OrderSuccess = lazy(() => import('../pages/OrderSuccess'));
const Wishlist = lazy(() => import('../pages/Wishlist'));
const Contact = lazy(() => import('../pages/Contact'));
const Careers = lazy(() => import('../pages/Careers'));
const NotFound = lazy(() => import('../pages/NotFound'));

const Login = lazy(() => import('../pages/auth/Login'));
const Register = lazy(() => import('../pages/auth/Register'));
const VerifyEmail = lazy(() => import('../pages/auth/VerifyEmail'));
const ForgotPassword = lazy(() => import('../pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('../pages/auth/ResetPassword'));

const AccountLayout = lazy(() => import('../pages/account/AccountLayout'));
const Profile = lazy(() => import('../pages/account/Profile'));
const Orders = lazy(() => import('../pages/account/Orders'));
const OrderDetail = lazy(() => import('../pages/account/OrderDetail'));
const Addresses = lazy(() => import('../pages/account/Addresses'));
const Devices = lazy(() => import('../pages/account/Devices'));
const Settings = lazy(() => import('../pages/account/Settings'));

const guard = (element) => <ProtectedRoute>{element}</ProtectedRoute>;

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    // Catches what the in-layout boundary can't: a crash in Layout/Header/Footer
    // itself, a failed route chunk, or a loader throw.
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Home /> },
      { path: 'products', element: <ProductList /> },
      { path: 'product/:slug', element: <ProductDetails /> },

      { path: 'contact', element: <Contact /> },
      { path: 'careers', element: <Careers /> },

      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
      // Reached from the register form and from a login refused as unverified; it
      // sends anyone who arrives without an address of its own back to register.
      { path: 'verify-email', element: <VerifyEmail /> },
      { path: 'forgot-password', element: <ForgotPassword /> },
      { path: 'reset-password/:token', element: <ResetPassword /> },

      { path: 'cart', element: guard(<Cart />) },
      { path: 'checkout', element: guard(<Checkout />) },
      { path: 'order-success/:id', element: guard(<OrderSuccess />) },
      { path: 'wishlist', element: guard(<Wishlist />) },

      {
        path: 'account',
        element: guard(<AccountLayout />),
        children: [
          { index: true, element: <Profile /> },
          { path: 'orders', element: <Orders /> },
          { path: 'orders/:id', element: <OrderDetail /> },
          { path: 'addresses', element: <Addresses /> },
          { path: 'devices', element: <Devices /> },
          { path: 'settings', element: <Settings /> },
        ],
      },

      // Legacy/alias paths people type by hand.
      { path: 'orders', element: <Navigate to="/account/orders" replace /> },
      { path: 'profile', element: <Navigate to="/account" replace /> },

      { path: '*', element: <NotFound /> },
    ],
  },
]);
