import React from 'react';
import { Link } from 'react-router-dom';
import Typography from '@material-ui-v3/core/Typography';
import Paper from '@material-ui-v3/core/Paper';
import Grid from '@material-ui-v3/core/Grid';
import SchoolIcon from '@material-ui-v3/icons/AccountBalance';
import TeachersIcon from '@material-ui-v3/icons/Group';
import MentorsIcon from '@material-ui-v3/icons/GroupOutlined';
import TimeslotsIcon from '@material-ui-v3/icons/Event';
import ReportsIcon from '@material-ui-v3/icons/PieChart';
import ButtonBase from '@material-ui-v3/core/ButtonBase';

const links = [
  {
    title: 'Школи',
    url: '/schools',
    icon: <SchoolIcon fontSize="inherit" />,
  },
  {
    title: 'Вчителі',
    url: '/teachers',
    icon: <TeachersIcon fontSize="inherit" />,
  },
  {
    title: 'Ментори',
    url: '/mentors',
    icon: <MentorsIcon fontSize="inherit" />,
  },
  {
    title: 'Уроки',
    url: '/timeslots',
    icon: <TimeslotsIcon fontSize="inherit" />,
  },
  {
    title: 'Звіти',
    url: '/reports',
    icon: <ReportsIcon fontSize="inherit" />,
  },
];

const Dashboard: React.FunctionComponent = () => (
  <>
    <Grid container spacing={16}>
      {links.map((link) => (
        <Grid item lg={2} md={3} sm={4} xs={6}>
          <ButtonBase
            focusRipple
            key={link.url}
            component={() => <Link to={link.url} />}
            style={{
              display: 'block',
            }}
          >
            <Paper style={{ padding: 20 }}>
              <Typography
                align="center"
                variant="display1"
                style={{ fontSize: 96, lineHeight: 0.8 }}
              >
                {link.icon}
              </Typography>
              <Typography align="center" variant="display1">
                {link.title}
              </Typography>
            </Paper>
          </ButtonBase>
        </Grid>
      ))}
    </Grid>
  </>
);

export default Dashboard;
