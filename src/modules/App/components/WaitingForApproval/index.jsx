import React from 'react';
import PropTypes from 'prop-types';

import { withStyles } from '@material-ui/core/styles';
import Typography from 'shared/components/Typography';

import Paper from 'shared/components/Paper';

const styles = theme => ({
  paper: {
    maxWidth: '80%',
    marginTop: theme.spacing.unit * 3,
    marginBottom: theme.spacing.unit * 3,
    padding: theme.spacing.unit * 2,
    [theme.breakpoints.up(600 + theme.spacing.unit * 3 * 2)]: {
      marginTop: theme.spacing.unit * 6,
      marginBottom: theme.spacing.unit * 6,
      padding: theme.spacing.unit * 3,
    },
  },
  root: {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    height: '100vh',
    width: '100%',
    backgroundColor: theme.palette.background.default,
  },
});

const WaitingForApproval = ({ classes }) => (
  <div className={classes.root}>
    <Paper className={classes.paper}>
      <Typography variant="display1" gutterBottom align="center">
        Очікується на підтвердження адміністратором
      </Typography>
      <Typography variant="title" gutterBottom align="center">
        Ми відправимо Вам повідомлення одразу після підтвердження.
      </Typography>
      <Typography variant="title" gutterBottom align="center">
        Дякую, що Ви з нами.
      </Typography>
    </Paper>
  </div>
);

WaitingForApproval.propTypes = {
  classes: PropTypes.shape({
    paper: PropTypes.string.isRequired,
    root: PropTypes.string.isRequired,
  }).isRequired,
};

export default withStyles(styles)(WaitingForApproval);
