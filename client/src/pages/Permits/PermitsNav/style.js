import styled from 'styled-components';
import { withTheme } from '@material-ui/core/styles';
import { NavLink } from 'react-router-dom';

export const Layout = styled.nav`
    width:auto;
    padding: 20px;
    background-color: #FFFFFF;
    box-shadow: 0px 2px 13px rgba(0, 0, 0, 0.08);

    margin: 12px -4.8rem 0 -4.8rem;
`

export const StyledLink = withTheme(styled(NavLink)`
    display: inline-block;

    font-family:  ${props => props.theme.fontFamily} !important;
    font-size: 16px;
    color: ${props => props.theme.palette.black};
    transition: 0.3s;
    
    height: 30px;

    &:hover, &.active {
        text-decoration: none;
        color: ${props => props.theme.palette.primary.main};
        border-bottom: 2px solid;
    }
`);