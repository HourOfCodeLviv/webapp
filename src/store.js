import {
  createStore,
  applyMiddleware,
  compose,
  combineReducers,
} from 'redux';
import createSagaMiddleware from 'redux-saga';

import { reducer as formReducer } from 'redux-form';

import { reducer as authReducer, sagas as authSagas } from 'modules/Auth';
import { reducer as mentorScheduleReducer, sagas as mentorScheduleSagas } from 'modules/MentorSchedule';
import { reducer as usersReducer, sagas as usersSagas } from 'modules/Users';
import { reducer as schoolsReducer, sagas as schoolsSagas } from 'modules/Schools';
import { reducer as scheduleReducer, sagas as scheduleSagas } from 'modules/Schedule';
import { reducer as profileReducer, sagas as profileSagas } from 'modules/Profile';

const reducer = combineReducers({
  auth: authReducer,
  form: formReducer,
  mentorSchedule: mentorScheduleReducer,
  profile: profileReducer,
  schedule: scheduleReducer,
  schools: schoolsReducer,
  users: usersReducer,
});

// ToDo: skip if prod
const composeEnhancers = (typeof window !== 'undefined' && window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) || compose; // eslint-disable-line

const sagaMiddleware = createSagaMiddleware();

const store = createStore(
  reducer,
  composeEnhancers(
    applyMiddleware(sagaMiddleware),
  ),
);

[
  ...authSagas,
  ...mentorScheduleSagas,
  ...scheduleSagas,
  ...schoolsSagas,
  ...usersSagas,
  ...profileSagas,
].map(sagaMiddleware.run);

export default store;
