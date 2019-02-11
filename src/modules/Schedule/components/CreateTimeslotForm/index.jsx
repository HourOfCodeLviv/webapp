import React from 'react';
import PropTypes from 'prop-types';
import { Field, reduxForm } from 'redux-form';
import Button from '@material-ui/core/Button';
import Grid from '@material-ui/core/Grid';
import FormControl from '@material-ui/core/FormControl';

import TextField from 'shared/components/ReduxForm/TextField';
import TimePickerField from 'shared/components/ReduxForm/TimePickerField';

import { CREATE_TIMESLOT_FORM_ID } from '../../constants';
import validate from './validate';

const CreateTimeslotForm = ({
  handleSubmit,
  pristine,
}) => (
  <form onSubmit={handleSubmit}>
    <Grid container spacing={40}>
      <Grid item sm={2}>
        {/* <Field
          component={DateTimePickerField}
          label="Час початку"
          name="startTime"
          required
          minDate="2018-12-03"
          maxDate="2018-12-08"
        /> */}
        <Field
          component={TimePickerField}
          label="Час початку"
          name="startTime"
          required
          minDate="2018-12-03"
          maxDate="2018-12-08"
        />
      </Grid>
      <Grid item sm={2}>
        <Field
          component={TextField}
          label="Клас"
          name="class"
          required
        />
      </Grid>
      <Grid item sm={2}>
        <Field
          component={TextField}
          label="Кількість учнів"
          name="pupilsCount"
          required
        />
      </Grid>
      <Grid item sm={4}>
        <Field
          component={TextField}
          label="Коментар ментору"
          name="notes"
          required
        />
      </Grid>
      <Grid item sm={2}>
        <FormControl fullWidth margin="normal">
          <Button
            fullWidth
            margin="normal"
            type="submit"
            variant="contained"
            color="primary"
            disabled={pristine}
            size="large"
          >
            Створити
          </Button>
        </FormControl>
      </Grid>
    </Grid>
  </form>
);

CreateTimeslotForm.propTypes = {
  pristine: PropTypes.bool.isRequired,
  handleSubmit: PropTypes.func.isRequired,
};

CreateTimeslotForm.defaultProps = {
};

export default reduxForm({
  form: CREATE_TIMESLOT_FORM_ID,
  validate,
})(CreateTimeslotForm);

export { CreateTimeslotForm as CreateTimeslotFormComponent };
