import 'bootstrap/dist/css/bootstrap.min.css';
import styles from './index.scss';
import React from 'react';
import { Link } from 'react-router';
import { graphql, compose } from 'react-apollo';
import gql from 'graphql-tag';
import AuthService from '../utilities/auth';
import config from '../config';

const UpdateUserQuery = gql`
mutation UpdateUser($user: UpdateUserInput!) {
  updateUser(input: $user) {
    changedUser {
      id
      username
      picture
    }
  }
}
`;

const LoginQuery = gql`
mutation Login($credential: LoginUserWithAuth0LockInput!) {
  loginUserWithAuth0Lock(input: $credential) {
    user {
      id
      username
    }
    token
  }
}
`;

const PublicChannelsQuery = gql`
query GetPublicChannels($wherePublic: ChannelWhereArgs, $orderBy: [ChannelOrderByArgs]) {
  viewer {
    allChannels(where: $wherePublic, orderBy: $orderBy) {
      edges {
        node {
          id
          name
          isPublic
        }
      }
    }
  }
}
`;

class Channels extends React.Component {
  
  constructor(props) {
    super(props);
    this.onAuthenticated = this.onAuthenticated.bind(this);
    this.startLogin = this.startLogin.bind(this);
    this.logout = this.logout.bind(this);
    this.auth = new AuthService(config.auth0ClientId, config.auth0Domain);
    this.auth.on('authenticated', this.onAuthenticated);
    this.auth.on('error', console.log);
  }

  componentWillUnmount() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  componentDidMount() {
    this.subscription = this.props.data.subscribeToMore({
      document: gql`
        subscription newChannels($subscriptionFilter:ChannelSubscriptionFilter) {
          subscribeToChannel(mutations:[createChannel], filter: $subscriptionFilter) {
            value {
              id
              name
              createdAt
            }
          }
        }
      `,
      variables: {
        subscriptionFilter: {
          isPublic: {
            eq: true
          }
        }
      },
      updateQuery: (prev, { subscriptionData }) => {
        return { 
          viewer: { 
            allChannels: { 
              edges: [
                ...prev.viewer.allChannels.edges,
                {
                  node: subscriptionData.data.subscribeToChannel.value
                }
              ] 
            } 
          } 
        };
      },
    });
  }

  onAuthenticated(auth0Profile, tokenPayload) {
    const identity = auth0Profile.identities[0];
    const that = this;
    this.props.loginUser({
      identity: Object.assign(identity, {
        access_token: tokenPayload.accessToken,
      }),
      token: tokenPayload.idToken,
    }).then(res => {
      const scapholdUserId = res.data.loginUserWithAuth0Lock.user.id;
      const profilePicture = auth0Profile.picture;
      const nickname = auth0Profile.nickname;
      return that.props.updateUser({
        id: scapholdUserId,
        picture: profilePicture,
        nickname: nickname 
      });

      // Cause a UI update :)
      this.setState({});
    }).catch(err => {
      console.log(`Error updating user: ${err.message}`);
    });
  }

  logout() {
    this.auth.logout()
    this.setState({});
  }

  startLogin() {
    this.auth.login();
  }

  render() {
    const profile = this.auth.getProfile();
    return (
      <div>
        <h3>Channels</h3>
        {
          this.props.data.viewer ?
            <ul>
              {
                this.props.data.viewer.allChannels.edges.map(edge => (
                  <li key={edge.node.id}><Link to={`/channels/${edge.node.id}`}>{edge.node.name}</Link></li>
                ))
              }
            </ul> : null
        }
        <Link to="/createChannel" style={{ color: 'white' }}>Create channel</Link>
        {
          !this.auth.loggedIn() ?
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '15px', textAlign: 'center'}}>
              <Link onClick={this.startLogin} style={{ color: 'white' }}>Login</Link>
            </div> :
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '15px', textAlign: 'center'}}>
              {
                profile ?
                  <div>
                    <img src={profile.picture} style={{ marginBottom: '5px', width: '40px', height: '40px', borderRadius: '20px' }}/>
                  </div> : 
                  null
              }
              <div>
                {profile ? profile.nickname : ''}
              </div>
              <button onClick={this.logout}>Logout</button>
            </div>
        }
      </div>
    )
  }
}

const ChannelsWithData = compose( 
  graphql(PublicChannelsQuery, {
    options: (props) => {
      return {
        returnPartialData: true,
        variables: {
          wherePublic: {
            isPublic: {
              eq: true,
            }
          },
          orderBy: [
            {
              field: 'name',
              direction: 'ASC'
            }
          ]
        },
      };
    },
  }),
  graphql(LoginQuery, {
    props: ({ mutate }) => ({
      loginUser: (credential) => mutate({ variables: { credential: credential }}),
    })
  }),
  graphql(UpdateUserQuery, {
    props: ({ mutate }) => ({
      updateUser: (user) => mutate({ variables: { user: user }}),
    })
  })
)(Channels);

export default ChannelsWithData;