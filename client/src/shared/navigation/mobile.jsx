import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Box, Drawer, ListItemText, Divider } from '@material-ui/core';
import MenuIcon from '@material-ui/icons/Menu';
import CloseIcon from '@material-ui/icons/Close';
import InboxIcon from '@material-ui/icons/MoveToInbox';
import AccountCircleIcon from '@material-ui/icons/AccountCircle';
import NotificationsNoneIcon from '@material-ui/icons/NotificationsNone';
import BookmarkBorderIcon from '@material-ui/icons/BookmarkBorder';
import StarIcon from '@material-ui/icons/Star';
import t from 'locale/he_IL';
import {  Row, IconButton, Menu } from 'shared';
import logo from 'assets/logo.png';
import { colors } from 'style/index'
import * as SC from './style'
import { PLANS, TREE_PERMITS } from 'router/contants'
import { openModal } from 'redux/modal/slice'
import { useDispatch } from 'react-redux';

const MobileNavBar = ({ logoutHandler, isAuthenticated }) => {
	const dispatch = useDispatch()
	const [mobileNavIsOpened, setMobileNavIsOpened] = useState(false);
	const [dropDownEl, setDropDownEl] = useState(null);

	const handleDropDownClick = (event) => {
		setDropDownEl(event.currentTarget);
	};

	const handleDropDownClose = () => {
		setDropDownEl(null);
	};

	return (
		<SC.StyledHeader>
			<SC.StyledContainer>
				<Row justify="space-between">
					<Box>
						<Row gutter={1.2}>
							<Box>
								<SC.StyledLink id='nav-bar-logo' to="/">
									<SC.Logo src={logo} alt={t.name}/>
								</SC.StyledLink>
							</Box>
							<Box component="nav">
								<Box display="flex" alignItems="center">
									{!isAuthenticated && (
										<Box px={2}>
											<SC.StyledLink id="nav-bar-plans" to="/plans/" activeClassName="active">
												{t.plans}
											</SC.StyledLink>
										</Box>
									)}
								</Box>
							</Box>
						</Row>
					</Box>
					<Box>
						<Row gutter={0.15}>
							{isAuthenticated && (
								<>
									<Box display="flex">
										<RouterLink id="nav-bar-favorites" to="#">
											<IconButton
												color={colors.purple}
												ariaLabel={'Favorites'}
												fontSize={24}
												paddingg={0}
											>
												<BookmarkBorderIcon/>
											</IconButton>
										</RouterLink>
									</Box>
									<Box display="flex">
										<RouterLink id="nav-bar-notifications" to="#">
											<IconButton
												color={colors.purple}
												ariaLabel={'Notifications'}
												fontSize={24}
												paddingg={0}
											>
												<NotificationsNoneIcon/>
											</IconButton>
										</RouterLink>
									</Box>

									<Box>
										<Menu
											ariaControls="user-menu"
											openHandler={handleDropDownClick}
											closeHandler={handleDropDownClose}
											textColor="#1a2d66"
											iconBefore={<AccountCircleIcon color="primary"/>}
											dropDownEl={dropDownEl}
											menuItems={[]}
										/>
									</Box>
								</>
							)}

							<Box>
								<IconButton color={colors.purple} ariaLabel={'open mobile menu'}>
									<MenuIcon onClick={() => setMobileNavIsOpened(true)}/>
								</IconButton>
								<Drawer open={mobileNavIsOpened}>
									<SC.MobileNavWrapper
										role="presentation"
									>
										<Box display="flex" justifyContent="flex-end" m={1.5}>
											<IconButton
												color={colors.black}
												ariaLabel={'close mobile menu'}
												fontSize={20.5}
											>
												<CloseIcon onClick={() => setMobileNavIsOpened(false)}/>
											</IconButton>
										</Box>

										<SC.StyledList>
											{isAuthenticated && (
												<SC.StyledListItem component={RouterLink} button key={t.myPlans}
													color="#652dd0">
													<ListItemText primary={t.myPlans}/>
													<SC.StyledStarIcon>
														<StarIcon/>
													</SC.StyledStarIcon>
												</SC.StyledListItem>
											)}
											<SC.StyledListItem component={RouterLink} to={PLANS} button key={t.plans}>
												<ListItemText primary={t.plans}/>
											</SC.StyledListItem>
											<SC.StyledListItem component={RouterLink} to={TREE_PERMITS} button key={t.treePermits}>
												<ListItemText primary={t.treePermits}/>
											</SC.StyledListItem>
										</SC.StyledList>
										<Divider/>
										<SC.StyledList>
											<SC.StyledListItem component={RouterLink} button key={t.supportUs}>
												<ListItemText primary={t.supportUs}/>
											</SC.StyledListItem>
										</SC.StyledList>
										<Divider/>
										<SC.StyledList>
											{!isAuthenticated && (
												<>
													<SC.StyledListItem component={SC.StyledLink} to="#" button 
														onClick={() => dispatch(openModal({ modalType: 'login' }))}
														key={t.signin}>
														<ListItemText primary={t.signin}/>
													</SC.StyledListItem>
													<SC.StyledListItem component={RouterLink} to="#" button
														onClick={() => dispatch(openModal({ modalType: 'register' }))}
														key={t.signup}
														color="#652dd0">
														<ListItemText primary={t.signup}/>
													</SC.StyledListItem>
												</>
											)}
											{isAuthenticated && (
												<>
													<SC.StyledListItem component={RouterLink} button
														key={t.alerts}>
														<ListItemText primary={t.alerts}/>
													</SC.StyledListItem>
													<SC.StyledListItem component={RouterLink}  button
														onClick={logoutHandler}
														key={t.signout}
														color="#b71f29">
														<ListItemText primary={t.signout}/>
														<SC.LogOutIcon>
															<InboxIcon/>
														</SC.LogOutIcon>
													</SC.StyledListItem>
												</>
											)}
										</SC.StyledList>
									</SC.MobileNavWrapper>
								</Drawer>
							</Box>
						</Row>
					</Box>
				</Row>
			</SC.StyledContainer>
		</SC.StyledHeader>
	);
}

MobileNavBar.propTypes = {
	isAuthenticated: PropTypes.bool.isRequired,
	user: PropTypes.object,
	logoutHandler: PropTypes.func.isRequired,
};

export default MobileNavBar;
