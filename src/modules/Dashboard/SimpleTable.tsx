import React from 'react';
import { withStyles, createStyles } from '@material-ui-v3/core/styles';
import Table from '@material-ui-v3/core/Table';
import TableBody from '@material-ui-v3/core/TableBody';
import TableCell from '@material-ui-v3/core/TableCell';
import TableHead from '@material-ui-v3/core/TableHead';
import TableRow from '@material-ui-v3/core/TableRow';
import Paper from '@material-ui-v3/core/Paper';

const styles = () => {
  return createStyles({
    root: {
      width: '100%',
      overflowX: 'auto',
    },
    table: {
      minWidth: 700,
    },
  });
};

type SimpleTableData = {
  id: number;
  name: string;
  calories: number;
  fat: number;
  carbs: number;
  protein: number;
};

let id = 0;
function createData(
  name: string,
  calories: number,
  fat: number,
  carbs: number,
  protein: number,
): SimpleTableData {
  id += 1;
  return { id, name, calories, fat, carbs, protein };
}

const data = [
  createData('Frozen yoghurt', 159, 6.0, 24, 4.0),
  createData('Ice cream sandwich', 237, 9.0, 37, 4.3),
  createData('Eclair', 262, 16.0, 24, 6.0),
  createData('Cupcake', 305, 3.7, 67, 4.3),
  createData('Gingerbread', 356, 16.0, 49, 3.9),
];

type SimpleTableClasses = {
  root: string;
  table: string;
};

const SimpleTable: React.FunctionComponent<{ classes: SimpleTableClasses }> = ({
  classes,
}) => {
  return (
    <Paper className={classes.root}>
      <Table className={classes.table}>
        <TableHead>
          <TableRow>
            <TableCell>Dessert (100g serving)</TableCell>
            <TableCell numeric>Calories</TableCell>
            <TableCell numeric>Fat (g)</TableCell>
            <TableCell numeric>Carbs (g)</TableCell>
            <TableCell numeric>Protein (g)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((n: SimpleTableData) => (
            <TableRow key={n.id}>
              <TableCell component="th" scope="row">
                {n.name}
              </TableCell>
              <TableCell numeric>{n.calories}</TableCell>
              <TableCell numeric>{n.fat}</TableCell>
              <TableCell numeric>{n.carbs}</TableCell>
              <TableCell numeric>{n.protein}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
};

export default withStyles(styles)(SimpleTable);
