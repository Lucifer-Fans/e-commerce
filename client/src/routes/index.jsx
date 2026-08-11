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

/** Informational and policy pages — the set the footer links to. */
const About = lazy(() => import('../pages/About'));
const ShippingPolicy = lazy(() => import('../pages/ShippingPolicy'));
const Returns = lazy(() => import('../pages/Returns'));
const RefundPolicy = lazy(() => import('../pages/RefundPolicy'));
const Faq = lazy(() => import('../pages/Faq'));
const Terms = lazy(() => import('../pages/Terms'));
const Privacy = lazy(() => import('../pages/Privacy'));

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

      { path: 'about', element: <About /> },
      { path: 'shipping-policy', element: <ShippingPolicy /> },
      { path: 'returns', element: <Returns /> },
      { path: 'refund-policy', element: <RefundPolicy /> },
      { path: 'faq', element: <Faq /> },
      { path: 'terms', element: <Terms /> },
      { path: 'privacy', element: <Privacy /> },

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
      // The policy URLs shoppers guess, and the ones older links and printed
      // invoices point at. Redirected rather than duplicated so each page keeps
      // exactly one canonical URL for search engines.
      { path: 'about-us', element: <Navigate to="/about" replace /> },
      { path: 'shipping', element: <Navigate to="/shipping-policy" replace /> },
      { path: 'return-policy', element: <Navigate to="/returns" replace /> },
      { path: 'returns-policy', element: <Navigate to="/returns" replace /> },
      { path: 'refunds', element: <Navigate to="/refund-policy" replace /> },
      { path: 'faqs', element: <Navigate to="/faq" replace /> },
      { path: 'terms-and-conditions', element: <Navigate to="/terms" replace /> },
      { path: 'terms-of-service', element: <Navigate to="/terms" replace /> },
      { path: 'privacy-policy', element: <Navigate to="/privacy" replace /> },

      { path: '*', element: <NotFound /> },
    ],
  },
]);
