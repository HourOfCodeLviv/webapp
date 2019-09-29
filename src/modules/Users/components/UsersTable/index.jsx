import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';

import Paper from 'shared/components/Paper';
import Table, {
  TableBody, TableCell, TableHead, TableRow,
} from 'shared/components/Table';

import UsersTableRow from '../UsersTableRow';

const styles = {
  root: {
    width: '100%',
    overflowX: 'auto',
  },
  table: {
    minWidth: 700,
  },
};

const UsersTable = ({ classes, users }) => (
  <Paper className={classes.root}>
    <Table className={classes.table}>
      <TableHead>
        <TableRow>
          <TableCell />
          <TableCell>Name</TableCell>
          <TableCell>Email</TableCell>
          <TableCell>Phone</TableCell>
          <TableCell>Roles</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {users.map(user => (
          <UsersTableRow key={user.uid} user={user} />
        ))}
      </TableBody>
    </Table>
  </Paper>
);

UsersTable.propTypes = {
  classes: PropTypes.instanceOf(Object),
  users: PropTypes.arrayOf(PropTypes.object).isRequired,
};

UsersTable.defaultProps = {
  classes: {},
};

export default withStyles(styles)(UsersTable);
