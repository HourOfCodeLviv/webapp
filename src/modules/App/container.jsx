import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { createSelector } from 'reselect';
import createMuiTheme from '@material-ui/core/styles/createMuiTheme';
import MuiThemeProvider from '@material-ui/core/styles/MuiThemeProvider';
import CssBaseline from '@material-ui/core/CssBaseline';

import {
  BrowserRouter as Router,
  Route,
  Switch,
} from 'react-router-dom';

import Page404 from 'modules/ErrorPage/Page404';
import Dashboard from 'modules/Dashboard';
// import AppWrapper from 'modules/App';
// import Users from 'modules/Users';
import Auth, {
  selectAuth,
  selectStateInitLoaded,
  selectUser,
  selectUserLoading,
  authStateInit,
  Signup,
} from 'modules/Auth';

import WelcomePage from './container/WelcomePage';

const theme = createMuiTheme({
  palette: {
    // type: 'dark',
    primary: {
      main: 'rgb(22, 150, 160)',
    },
  },
});

const AppLoading = () => <div>Loading</div>;

const Public = () => (
  <Router>
    <Switch>
      <Route path="/" exact component={WelcomePage} />
      <Route component={Page404} />
    </Switch>
  </Router>
);

const Private = () => (
  <Router>
    {/* <AppWrapper> */}
      <Switch>
        <Route path="/" exact component={Dashboard} />
        <Route component={Page404} />
      </Switch>
    {/* </AppWrapper> */}
  </Router>
);

class App extends React.Component {
  static propTypes = {
    auth: PropTypes.instanceOf(Object),
    authStateLoaded: PropTypes.bool.isRequired,
    onAuthStateInit: PropTypes.func.isRequired,
    user: PropTypes.instanceOf(Object),
    userLoading: PropTypes.bool.isRequired,
  }

  static defaultProps = {
    auth: null,
    user: null,
  }

  componentDidMount() {
    const { onAuthStateInit } = this.props;
    onAuthStateInit();
  }

  renderContent = () => {
    const {
      props: {
        auth,
        user,
        userLoading,
        authStateLoaded,
      },
    } = this;

    // return auth.toString();

    if (!authStateLoaded || userLoading) {
      return <AppLoading />;
    }

    if (!auth) {
      return <Public />;
    }

    // some special cases when user isn't completely registeted
    if (auth && !user) {
      return <Signup />;
    }

    if (auth && user) {
      return <Private />;
    }

    // return <AuthAdmin />;
  };

  render() {
    const { renderContent } = this;
    return (
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {renderContent()}
      </MuiThemeProvider>
    );
  }
}


const mapStateToProps = createSelector(
  selectAuth(),
  selectUser(),
  selectUserLoading(),
  selectStateInitLoaded(),
  (
    auth,
    user,
    userLoading,
    authStateLoaded,
  ) => ({
    auth,
    user,
    userLoading,
    authStateLoaded,
  }),
);

const mapDispatchToProps = {
  onAuthStateInit: authStateInit,
};

export default connect(mapStateToProps, mapDispatchToProps)(App);
export { App as AppComponent };
