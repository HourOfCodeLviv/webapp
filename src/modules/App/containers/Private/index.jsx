import React from 'react';
import {
  BrowserRouter as Router,
  Route,
  Switch,
} from 'react-router-dom';

import Page404 from 'modules/ErrorPage/Page404';
import Dashboard from 'modules/Dashboard';
import Schools, { School, SchoolCreate, SchoolEdit } from 'modules/Schools';
// import { Teachers } from 'modules/Users';
import Schedule from 'modules/Schedule';
import MentorSchedule, { MentorScheduleApply } from 'modules/MentorSchedule';
import Profile from 'modules/Profile';
import {
  Mentor as AdminMentor,
  Mentors as AdminMentors,
  Teachers as AdminTeachers,
  Timeslots as AdminTimeslots,
} from 'modules/Admin';

import AppWrapper from '../AppWrapper';

const Private = ({ user }) => (
  <Router>
    <AppWrapper>
      <Switch>
        {user.admin && [
          <Route path="/" exact component={Dashboard} />,
          <Route path="/schools" exact component={Schools} />,
          <Route path="/school/new" exact component={SchoolCreate} />,
          <Route path="/school/:id" exact component={School} />,
          <Route path="/school/:id/edit" exact component={SchoolEdit} />,
          <Route path="/teachers" exact component={AdminTeachers} />,
          <Route path="/timeslots" exact component={AdminTimeslots} />,
          <Route path="/mentors" exact component={AdminMentors} />,
          <Route path="/mentor/:id" exact component={AdminMentor} />,
        ]}
        {user.teacher && (
          <Route path="/" exact component={Schedule} />
        )}
        {user.mentor && [
          <Route path="/" exact component={MentorSchedule} />,
          <Route path="/apply" exact component={MentorScheduleApply} />,
        ]}
        <Route path="/me" exact component={Profile} />
        <Route component={Page404} />
      </Switch>
    </AppWrapper>
  </Router>
);

export default Private;